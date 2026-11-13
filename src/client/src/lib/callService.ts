// #lib/callService.ts
// P2P voice calls within a selected group, using PeerJS over the existing
// socket.io signaling. Media flows peer-to-peer (WebRTC); the server only
// shares PeerJS ids and mute state.
//
// The join flow is symmetric rather than mesh-negotiated:
// 1. join: the client dials every participant the ack returns
//    (they auto-answer with their mic stream).
// 2. someone else joins later: the server broadcasts
//    `group:call:participant-joined`, and every existing member dials the
//    newcomer. DIAL DIRECTION IS DETERMINISTIC: the peer with the
//    lexicographically GREATER id always dials; the lesser id only answers.
//    Without this, both sides can dial simultaneously and both drop the
//    duplicate incoming call — two unanswered outgoing calls, zero audio.
import Peer from "peerjs";
import { get } from "svelte/store";
import { writable, type Writable } from "svelte/store";
import getSocket from "#lib/io.ts";
import { user } from "#lib/stores.ts";
import { peerIdFor } from "#lib/callIdentity.ts";
import type { MediaConnection } from "peerjs";

export type CallParticipant = {
  userId: string;
  peerId: string;
  muted: boolean;
};

type CallState = {
  active: boolean;
  connecting: boolean;
  muted: boolean;
  participants: CallParticipant[];
  error?: string;
};

const initial: CallState = {
  active: false,
  connecting: false,
  muted: false,
  participants: [],
};

export const callState: Writable<CallState> = writable({ ...initial });

// MediaStream handles for rendering; keyed by peer id (which encodes userId).
export const remoteStreams = writable<Record<string, MediaStream>>({});
export const localStream = writable<MediaStream | null>(null);

let peer: Peer | null = null;
const connections = new Map<string, MediaConnection>(); // peerId -> MediaConnection

/** Only the peer with the greater id dials; ties are impossible (ids are unique per pair). */
function shouldDial(myPeerId: string, remotePeerId: string) {
  return myPeerId > remotePeerId;
}

export async function startCall(groupId: string) {
  if (!get(user) || peer) return;

  callState.set({ ...initial, connecting: true });
  remoteStreams.set({});

  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    callState.set({
      ...initial,
      error: "Microphone access denied. Allow it in your browser settings.",
    });
    return;
  }
  localStream.set(mic);

  const socket = getSocket();
  const myUserId = get(user)!.id;
  const myPeerId = peerIdFor(myUserId, groupId);

  peer = new Peer(myPeerId, { debug: 1 });
  bindPeer(groupId);

  // Once brokered, tell the signal server and dial existing participants
  // (only the deterministic dialer side of each pair dials).
  peer.on("open", () => {
    socket.emit("group:call:join", myPeerId, async (res: any) => {
      if (!res?.ok) {
        callState.set({
          ...initial,
          error: callError(res?.error),
        });
        await hangUp();
        return;
      }

      callState.set({
        active: true,
        connecting: false,
        muted: false,
        participants: res.participants,
      });

      for (const p of res.participants) {
        if (
          p.userId !== myUserId &&
          !connections.has(p.peerId) &&
          shouldDial(myPeerId, p.peerId)
        ) {
          connectTo(p.peerId);
        }
      }
    });
  });
}

function bindPeer(groupId: string) {
  const p = peer!;
  const socket = getSocket();
  const myUserId = get(user)!.id;
  const myPeerId = peerIdFor(myUserId, groupId);

  p.on("call", (mc) => {
    // Deterministic dialing: this incoming call is from the side that is
    // supposed to dial us. Answer it — unless we already hold a live
    // connection to that peer (brokered duplicate).
    const existing = connections.get(mc.peer);
    if (existing) {
      mc.close();
      return;
    }
    const stream = get(localStream);
    if (stream) mc.answer(stream);
    trackConnection(mc);
  });

  p.on("error", async (err) => {
    // Taken means a stale registration is holding our peer id.
    if (String(err.type) === "unavailable-id") {
      callState.set({
        ...get(callState),
        connecting: false,
        active: false,
        error: "Another device of yours is already in this call.",
      });
      await hangUp();
    } else {
      callState.set({ ...get(callState), error: err.message });
    }
  });

  socket.on(
    "group:call:participant-joined",
    (participant: CallParticipant) => {
      if (participant.userId === myUserId) return;
      upsertParticipant(participant);
      // Deterministic direction: only one side of the pair dials; the other
      // answers the incoming call (no racing drops, exactly one hop).
      if (
        peer &&
        !connections.has(participant.peerId) &&
        shouldDial(myPeerId, participant.peerId)
      ) {
        connectTo(participant.peerId);
      }
    },
  );

  socket.on("group:call:participant-updated", (participant: CallParticipant) =>
    upsertParticipant(participant),
  );

  socket.on(
    "group:call:participant-left",
    ({ userId }: { userId: string }) => {
      const id = peerIdFor(userId, groupId);
      connections.get(id)?.close();
      connections.delete(id);
      if (userId === myUserId) return;
      remoteStreams.update((s) => {
        const { [id]: _drop, ...rest } = s;
        return rest;
      });
      callState.update((c) => ({
        ...c,
        participants: c.participants.filter((x) => x.userId !== userId),
      }));
    },
  );
}

function connectTo(peerId: string) {
  const stream = get(localStream);
  if (!peer || !stream) return;
  const mc = peer.call(peerId, stream);
  trackConnection(mc);
}

function trackConnection(mc: MediaConnection) {
  connections.set(mc.peer, mc);

  mc.on("stream", (stream) => {
    remoteStreams.update((s) => ({ ...s, [mc.peer]: stream }));
  });

  const teardown = () => {
    if (connections.get(mc.peer) === mc) {
      connections.delete(mc.peer);
      remoteStreams.update((s) => {
        const { [mc.peer]: _drop, ...rest } = s;
        return rest;
      });
    }
  };
  mc.on("close", teardown);
  mc.on("error", teardown);
}

function upsertParticipant(participant: CallParticipant) {
  callState.update((c) => {
    const others = c.participants.filter(
      (x) => x.userId !== participant.userId,
    );
    return { ...c, participants: [...others, participant] };
  });
}

/** Mute or unmute my microphone; broadcasts state so tiles can grey out. */
export function toggleMute(groupId: string) {
  const muted = !get(callState).muted;
  callState.update((c) => ({ ...c, muted }));
  get(localStream)
    ?.getAudioTracks()
    .forEach((t: MediaStreamTrack) => (t.enabled = !muted));
  getSocket().emit("group:call:mute", muted);
}

/** Leave the call and release everything. */
export async function hangUp() {
  const socket = getSocket();

  for (const mc of connections.values()) mc.close();
  connections.clear();
  remoteStreams.set({});
  get(localStream)
    ?.getTracks()
    .forEach((t: MediaStreamTrack) => t.stop());
  localStream.set(null);

  const wasActive = get(callState).active || get(callState).connecting;
  callState.set({ ...initial });

  if (wasActive) {
    await new Promise<void>((resolve) => {
      socket.timeout(1000).emit("group:call:leave", () => resolve());
    });
  }

  peer?.destroy();
  peer = null;

  socket.off("group:call:participant-joined");
  socket.off("group:call:participant-updated");
  socket.off("group:call:participant-left");
}

function callError(code?: string) {
  switch (code) {
    case "not-in-group":
      return "Select this group before calling.";
    case "invalid":
      return "The call request was rejected by the server.";
    default:
      return "Couldn't start the call.";
  }
}
