<script lang="ts">
  import { API_ROOT } from "#lib";
  import { createFriendRequest, fetchSentInvitations } from "#lib/api.ts";
  import { friends, sentInvitations } from "#lib/stores.ts";
  import type { PublicUser } from "#lib/types.ts";
  import Button from "./Button.svelte";

  let { target }: { target: PublicUser } = $props();

  let addingId = $state<string>();

  async function addFriend(userId: string) {
    addingId = userId;
    try {
      await createFriendRequest(userId);
      sentInvitations.set(await fetchSentInvitations());
    } finally {
      addingId = undefined;
    }
  }
</script>

<li class="list-row items-center">
  <img
    class="size-10 rounded-box border-2 border-neutral object-cover"
    alt=""
    src={target.avatarUrl
      ? `${API_ROOT}${target.avatarUrl}`
      : "/default-avatar.png"}
  />

  <div class="list-col-grow min-w-0">
    <div class="flex items-baseline gap-1">
      <span class="truncate font-bold"
        >{target.displayName || target.username}</span
      >
      {#if target.displayName}
        <span class="truncate text-xs text-base-content/60"
          >@{target.username}</span
        >
      {/if}
    </div>
    <div class="truncate text-xs font-semibold text-base-content/60">
      {target.description || "No description"}
    </div>
  </div>

  {#if $sentInvitations?.find((i) => i.targetId === target.id)}
    <Button size="sm" variant="outline" disabled>Pending</Button>
  {:else if $friends?.find((f) => f.id === target.id)}
    <Button size="sm" variant="ghost" disabled>Friends</Button>
  {:else}
    <Button
      size="sm"
      loading={addingId === target.id}
      onclick={() => addFriend(target.id)}
    >
      Add
    </Button>
  {/if}
</li>
