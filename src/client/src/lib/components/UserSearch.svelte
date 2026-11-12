<script lang="ts">
  import { API_ROOT } from "#lib";
  import { fetchFilteredUsers } from "#lib/api.ts";
  import { friends, sentInvitations, user as me } from "#lib/stores.ts";
  import { Button } from "#lib/components/index.ts";
  import ProfileChip from "./ProfileChip.svelte";

  let searchFieldValue = $state("");
  // Debounced copy of the search text, so we don't fire a request per keystroke
  let query = $state("");
  let open = $state(false);

  $effect(() => {
    const value = searchFieldValue.trim();

    if (!value) {
      query = "";
      return;
    }

    const timeout = setTimeout(() => (query = value), 250);
    return () => clearTimeout(timeout);
  });
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
          <ProfileChip target={user}></ProfileChip>
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
