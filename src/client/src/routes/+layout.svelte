<script lang="ts">
  import favicon from "#lib/assets/favicon.svg";
  import type { LayoutProps } from "./$types";
  import "../app.css";
  import { Navbar } from "#lib/components/index.ts";
  import GroupSelector from "#lib/components/GroupSelector.svelte";

  let { children }: LayoutProps = $props();

  // Warm the app on startup: user + groups land while the user is on any page,
  // so navigating into a group chat starts with data already in memory.
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { token as tokenStore, user as userStore } from "#lib/stores.ts";
  import { fetchMe } from "#lib/api.ts";
  import { prefetchGroups } from "#lib/groupCache.ts";

  onMount(() => {
    (async () => {
      if (!get(tokenStore)) return;
      if (!get(userStore)) {
        const me = await fetchMe();
        if (me) userStore.set(me);
      }
      await prefetchGroups();
    })();
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<Navbar />

<div class="shell h-full w-full">
  <main class="h-full w-full">
    {@render children()}
  </main>
</div>

<GroupSelector />
