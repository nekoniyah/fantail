<script lang="ts">
  import favicon from "#lib/assets/favicon.svg";
  import type { LayoutProps } from "./$types";
  import "../app.css";
  import { Navbar } from "#lib/components/index.ts";
  import GroupSelector from "#lib/components/GroupSelector.svelte";

  let { children }: LayoutProps = $props();
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
