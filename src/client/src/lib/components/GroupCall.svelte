<script lang="ts">
  import { onMount } from "svelte";
  import {
    callState,
    remoteStreams,
    startCall,
    toggleMute,
    hangUp,
  } from "#lib/callService.ts";
  import { user } from "#lib/stores.ts";
  import { fetchUser } from "#lib/api.ts";
  import { API_ROOT } from "#lib";
  import { Button } from "#lib/components/index.ts";

  type Props = {
    groupId: string;
    /** Names for participant tiles, keyed by userId. */
    nameOf: (userId: string) => string;
    avatarOf: (userId: string) => string;
  };

  let { groupId, nameOf, avatarOf }: Props = $props();

  let callInfo = $derived($callState);
  let inCall = $derived(callInfo.active || callInfo.connecting);

  const audioEls = new Map<string, HTMLAudioElement>();

  // Participants the nameOf/avatarOf resolvers can't identify (e.g. a member
  // added after this group object was cached) get fetched from /users/:id.
  type Profile = { label?: string; avatarUrl?: string };
  let profiles: Record<string, Profile> = $state({});
  const fetching = new Set<string>();

  function profileFor(userId: string): Profile {
    const label = nameOf(userId);
    if (label !== "loading…") return { label, avatarUrl: "" };
    return profiles[userId] ?? {};
  }

  async function ensureProfile(userId: string) {
    if (nameOf(userId) !== "loading…" || fetching.has(userId)) return;
    fetching.add(userId);
    try {
      const u = await fetchUser(userId);
      if (u) {
        profiles[userId] = {
          label: u.displayName || u.username,
          avatarUrl: u.avatarUrl
            ? `${API_ROOT}${u.avatarUrl}`
            : "/default-avatar.png",
        };
        profiles = { ...profiles }; // re-trigger resolution
      }
    } finally {
      fetching.delete(userId);
    }
  }

  $effect(() => {
    for (const p of $callState.participants) {
      ensureProfile(p.userId);
    }
  });

  function attachAudio(node: HTMLAudioElement, peerId: string) {
    audioEls.set(peerId, node);
    const stream = $remoteStreams[peerId];
    if (stream) {
      node.srcObject = stream;
      node.play().catch(() => {
        // Autoplay may be blocked; browsers allow it after any user gesture
      });
    }
    return {
      destroy() {
        audioEls.delete(peerId);
      },
    };
  }

  // Wire streams as they arrive / get removed
  $effect(() => {
    const streams = $remoteStreams;
    for (const [peerId, stream] of Object.entries(streams)) {
      const el = audioEls.get(peerId);
      if (el) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    }
  });

  onMount(() => {
    return () => {
      // Navigating away from the group ends my call.
      void hangUp();
    };
  });
</script>

{#if inCall}
  <!-- Call panel: fixed, doesn't move the chat. -->
  <div
    class="fixed right-4 bottom-24 z-40 w-80 rounded-box border-2 border-neutral bg-base-100 shadow-[0_6px_0_0_var(--color-neutral)]"
    role="region"
    aria-label="Voice call"
  >
    <div class="flex items-center justify-between gap-2 px-4 pt-3">
      <h3 class="font-display text-sm font-bold">
        {#if callInfo.connecting}
          Calling…
        {:else}
          Voice call · {callInfo.participants.length}
        {/if}
      </h3>
      <span
        class="badge badge-sm {callInfo.connecting ? 'badge-warning' : 'badge-success'}"
      >
        {callInfo.connecting ? "…" : "live"}
      </span>
    </div>

    {#if callInfo.error}
      <p role="alert" class="px-4 pt-2 font-bold text-error">
        {callInfo.error}
      </p>
    {/if}

    <div class="flex max-h-48 flex-col gap-1 overflow-y-auto px-4 py-3">
      {#each callInfo.participants as participant (participant.userId)}
        {@const profile = profileFor(participant.userId)}
        <div class="flex items-center gap-2">
          <img
            class="size-8 rounded-full border-2 border-neutral object-cover"
            alt=""
            src={profile.avatarUrl || avatarOf(participant.userId)}
          />
          <span class="min-w-0 grow truncate text-sm font-semibold">
            {profile.label ?? nameOf(participant.userId)}
            {participant.userId === $user?.id ? "(you)" : ""}
          </span>
          {#if participant.muted}
            <span class="text-xs opacity-60" title="Muted">🔇</span>
          {/if}
          {#if $remoteStreams[participant.peerId]}
            <span class="size-2 rounded-full bg-success" title="Connected"></span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Remote audio elements: hidden, kept mounted while streams exist -->
    {#each Object.entries($remoteStreams) as [peerId] (peerId)}
      <audio use:attachAudio={peerId} class="hidden"></audio>
    {/each}

    <div class="flex items-center justify-center gap-3 border-t-2 border-neutral px-4 py-3">
      <Button
        variant={callInfo.muted ? "accent" : "outline"}
        class="btn-circle"
        aria-label={callInfo.muted ? "Unmute" : "Mute"}
        aria-pressed={callInfo.muted}
        onclick={() => toggleMute(groupId)}
      >
        {callInfo.muted ? "🔇" : "🎙️"}
      </Button>
      <Button variant="primary" class="btn-circle" onclick={() => void hangUp()}>
        📴
      </Button>
    </div>
  </div>
{/if}