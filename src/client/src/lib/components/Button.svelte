<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type Variant = "primary" | "secondary" | "accent" | "outline" | "ghost";
  type Size = "xs" | "sm" | "md" | "lg";

  interface Props extends HTMLButtonAttributes {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    block?: boolean;
    children: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    loading = false,
    block = false,
    disabled = false,
    type = "button",
    class: className = "",
    children,
    ...rest
  }: Props = $props();

  // Playful "pressable" look: chunky border + hard shadow that squishes on click
  const pop =
    "border-2 border-neutral shadow-[0_4px_0_0_var(--color-neutral)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_var(--color-neutral)] active:translate-y-1 active:shadow-none";

  const variants: Record<Variant, string> = {
    primary: `btn-primary ${pop}`,
    secondary: `btn-secondary ${pop}`,
    accent: `btn-accent ${pop}`,
    outline: `bg-base-100 text-base-content hover:bg-secondary ${pop}`,
    ghost: "btn-ghost border-transparent shadow-none hover:bg-secondary/60",
  };

  const sizes: Record<Size, string> = {
    xs: "btn-xs",
    sm: "btn-sm",
    md: "btn-md",
    lg: "btn-lg",
  };
</script>

<button
  {...rest}
  {type}
  disabled={disabled || loading}
  aria-busy={loading}
  class={[
    "btn rounded-full font-bold tracking-wide transition-all duration-150 disabled:translate-y-0 disabled:shadow-none",
    variants[variant],
    sizes[size],
    block && "btn-block",
    className,
  ]}
>
  {#if loading}
    <span class="loading loading-spinner loading-sm"></span>
  {/if}
  {@render children()}
</button>
