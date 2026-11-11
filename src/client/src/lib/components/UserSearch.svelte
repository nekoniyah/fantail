<script lang="ts">
  import { API_ROOT } from "#lib";
  import {
    createFriendRequest,
    fetchFilteredUsers,
    fetchSentInvitations,
  } from "#lib/api.ts";
  import { friends, sentInvitations, user as me } from "#lib/stores.ts";
  import { Button } from "#lib/components/index.ts";

  let searchFieldValue = $state("");
  // Debounced copy of the search text, so we don't fire a request per keystroke
  let query = $state("");
  let open = $state(false);
  let addingId = $state<string>();

  $effect(() => {
    const value = searchFieldValue.trim();

    if (!value) {
      query = "";
      return;
    }

    const timeout = setTimeout(() => (query = value), 250);
    return () => clearTimeout(timeout);
  });

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative"
  onfocusin={() => (open = true)}
  onfocusout={(ev) => {
    // Close only when focus leaves the whole search widget
    if (!ev.currentTarget.contains(ev.relatedTarget as Node | null))
      open = false;
  }}
  onkeydown={(ev) => {
    if (ev.key === "Escape") {
      open = false;
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }}
>
  <label
    class="input w-48 border-2 border-neutral bg-base-100 transition-all focus-within:-translate-y-0.5 focus-within:border-primary focus-within:shadow-[0_4px_0_0_var(--color-primary)] focus-within:outline-none sm:w-72"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="size-5 opacity-60"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
    <input
      type="search"
      class="grow"
      placeholder="Search users"
      aria-label="Search users"
      autocomplete="off"
      bind:value={searchFieldValue}
    />
  </label>

  {#if open && query}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <ul
      class="list absolute top-full right-0 z-10 mt-3 w-96 max-w-[calc(100vw-2rem)] rounded-box border-2 border-neutral bg-base-100 shadow-[0_5px_0_0_var(--color-neutral)]"
      aria-live="polite"
      onmousedown={(ev) => ev.preventDefault()}
    >
      <li class="p-4 pb-2 font-display text-sm font-bold tracking-wide">
        Users
      </li>

      {#await fetchFilteredUsers(query)}
        <li class="flex items-center gap-2 p-4 text-base-content/70">
          <span class="loading loading-sm loading-dots"></span>
          Searching…
        </li>
      {:then users}
        {@const results = users.filter((u) => u.id !== $me?.id)}
        {#each results as user (user.id)}
          <li class="list-row items-center">
            <img
              class="size-10 rounded-box border-2 border-neutral object-cover"
              alt=""
              src={user.avatarUrl
                ? `${API_ROOT}${user.avatarUrl}`
                : "/default-avatar.png"}
            />

            <div class="list-col-grow min-w-0">
              <div class="flex items-baseline gap-1">
                <span class="truncate font-bold"
                  >{user.displayName || user.username}</span
                >
                {#if user.displayName}
                  <span class="truncate text-xs text-base-content/60"
                    >@{user.username}</span
                  >
                {/if}
              </div>
              <div class="truncate text-xs font-semibold text-base-content/60">
                {user.description || "No description"}
              </div>
            </div>

            {#if $sentInvitations?.find((i) => i.targetId === user.id)}
              <Button size="sm" variant="outline" disabled>Pending</Button>
            {:else if $friends?.find((f) => f.id === user.id)}
              <Button size="sm" variant="ghost" disabled>Friends</Button>
            {:else}
              <Button
                size="sm"
                loading={addingId === user.id}
                onclick={() => addFriend(user.id)}
              >
                Add
              </Button>
            {/if}
          </li>
        {:else}
          <li class="p-4 text-center text-base-content/70">
            No users found for “{query}”.
          </li>
        {/each}
      {:catch}
        <li class="p-4 font-bold text-error">
          Search failed. Please try again.
        </li>
      {/await}
    </ul>
  {/if}
</div>
