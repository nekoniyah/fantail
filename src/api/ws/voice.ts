import type { Server, Socket } from "socket.io";
import type { User } from "@prisma";
import prisma from "@lib/prisma";

// ─────────────── Group calls (P2P via PeerJS) ───────────────
// This module is pure signaling: it keeps an in-memory per-group call
// roster and relays PeerJS peer ids between members. Media itself never
// touches the server — it flows WebRTC peer-to-peer.

type Participant = {
  userId: string;
  peerId: string; // PeerJS id of this participant
  muted: boolean;
};

/** groupId -> (userId -> participant); call ends when the map empties. */
const calls = new Map<string, Map<string, Participant>>();

export function peerIdFor(userId: string, groupId: string) {
  // Deterministic and collision-free across groups; PeerJS ids allow - and _.
  return `${groupId}-${userId}`;
}

export function listenVoiceCallEvents(io: Server, socket: Socket, user: User) {
  const room = (groupId: string) => `call:${groupId}`;

  /** Only callers who selected the group may signal in it. */
  async function currentGroupId() {
    // The group module owns selectedGroup state; ask it via socket data.
    const selected = (socket.data as { groupId?: string }).groupId;
    if (!selected) return null;
    const g = await prisma.group.findUnique({
      where: { id: selected },
      include: { members: { select: { id: true } } },
    });
    if (!g) return null;
    const isMember =
      g.ownerId === user.id ||
      g.members.some((m: { id: string }) => m.id === user.id);
    if (!isMember) return null;
    return g.id;
  }

  function roster(groupId: string): Participant[] {
    return [...(calls.get(groupId)?.values() ?? [])];
  }

  function broadcast(groupId: string, event: string, ...args: unknown[]) {
    io.to(room(groupId)).emit(event, ...args);
  }

  socket.on("group:call:join", async (peerId: unknown, cb = noop) => {
    const groupId = await currentGroupId();
    if (!groupId) return cb({ ok: false, error: "not-in-group" });
    if (typeof peerId !== "string" || peerId.length > 255)
      return cb({ ok: false, error: "invalid" });

    const participants = calls.get(groupId) ?? new Map();
    const me: Participant = {
      userId: user.id,
      peerId,
      muted: false,
    };

    participants.set(user.id, me);
    calls.set(groupId, participants);
    socket.data.callGroupId = groupId;
    socket.join(room(groupId));

    // The joiner needs the full roster to dial everyone; others need the joiner.
    cb({ ok: true, participants: roster(groupId) });
    socket.to(room(groupId)).emit("group:call:participant-joined", me);
  });

  socket.on("group:call:mute", async (muted: unknown, cb = noop) => {
    const callGroupId = (socket.data as { callGroupId?: string }).callGroupId;
    if (!callGroupId || typeof muted !== "boolean") return cb(false);

    const participant = calls.get(callGroupId)?.get(user.id);
    if (!participant) return cb(false);

    participant.muted = muted;
    broadcast(callGroupId, "group:call:participant-updated", participant);
    cb(true);
  });

  socket.on("group:call:leave", async (cb = noop) => {
    const callGroupId = (socket.data as { callGroupId?: string }).callGroupId;
    if (!callGroupId) return cb(false);
    leave(callGroupId);
    cb(true);
  });

  async function leave(groupId: string) {
    const participants = calls.get(groupId);
    if (!participants?.has(user.id)) return;

    participants.delete(user.id);
    socket.leave(room(groupId));
    socket.data.callGroupId = undefined;

    broadcast(groupId, "group:call:participant-left", { userId: user.id });

    if (!participants.size) calls.delete(groupId);
  }

  // Leaving the selected group also drops you from its call
  const onDisconnect = async () => {
    const callGroupId = (socket.data as { callGroupId?: string }).callGroupId;
    if (callGroupId) await leave(callGroupId);
  };
  socket.on("disconnect", onDisconnect);
}

const noop: (...args: any[]) => void = () => {};
