<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** A single emoji or short text shown large above the title */
    icon?: string;
    title: string;
    description?: string;
    class?: string;
    /** Optional extra content, e.g. a badge or an action button */
    children?: Snippet;
  }

  let {
    icon,
    title,
    description,
    class: className = "",
    children,
  }: Props = $props();
</script>

<div
  class={[
    "flex flex-col items-center gap-3 rounded-box border-2 border-dashed border-neutral/40 bg-base-200 px-6 py-10 text-center",
    className,
  ]}
>
  {#if icon}
    <span class="text-5xl" aria-hidden="true">{icon}</span>
  {/if}

  <h3 class="font-display text-xl font-bold">{title}</h3>

  {#if description}
    <p class="max-w-prose text-base-content/70">{description}</p>
  {/if}

  {@render children?.()}
</div>
