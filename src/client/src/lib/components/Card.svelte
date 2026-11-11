<script lang="ts">
  import type { Snippet } from "svelte";

  type Tone = "base" | "peach" | "ember";

  interface Props {
    title?: string;
    tone?: Tone;
    hoverable?: boolean;
    class?: string;
    media?: Snippet;
    actions?: Snippet;
    children?: Snippet;
  }

  let {
    title,
    tone = "base",
    hoverable = false,
    class: className = "",
    media,
    actions,
    children,
  }: Props = $props();

  const tones: Record<Tone, string> = {
    base: "bg-base-100 text-base-content",
    peach: "bg-secondary text-secondary-content",
    ember: "bg-primary text-primary-content",
  };
</script>

<article
  class={[
    "card border-2 border-neutral shadow-[0_6px_0_0_var(--color-neutral)]",
    tones[tone],
    hoverable &&
      "transition-all duration-200 hover:-translate-y-1 hover:-rotate-1 hover:shadow-[0_10px_0_0_var(--color-neutral)]",
    className,
  ]}
>
  {#if media}
    <figure class="border-b-2 border-neutral">
      {@render media()}
    </figure>
  {/if}

  <div class="card-body">
    {#if title}
      <h3 class="card-title font-display text-xl">{title}</h3>
    {/if}
    {@render children?.()}
    {#if actions}
      <div class="card-actions mt-2 justify-end">
        {@render actions()}
      </div>
    {/if}
  </div>
</article>
