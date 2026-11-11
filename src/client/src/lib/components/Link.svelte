<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";

  type Variant = "default" | "nav" | "subtle";

  interface Props extends HTMLAnchorAttributes {
    variant?: Variant;
    active?: boolean;
    children: Snippet;
  }

  let {
    variant = "default",
    active = false,
    href,
    class: className = "",
    children,
    ...rest
  }: Props = $props();

  const variants: Record<Variant, string> = {
    default:
      "link link-primary font-bold decoration-2 underline-offset-4 hover:decoration-wavy",
    nav: "rounded-full px-4 py-2 font-bold text-base-content no-underline transition-colors hover:bg-secondary/60",
    subtle:
      "text-base-content/70 underline-offset-4 transition-colors hover:text-primary hover:underline",
  };

  const activeVariants: Record<Variant, string> = {
    default: "decoration-wavy",
    nav: "bg-secondary",
    subtle: "text-primary",
  };

  const external = $derived(!!href && /^(https?:)?\/\//.test(href));
</script>

<a
  {...rest}
  {href}
  target={external ? "_blank" : rest.target}
  rel={external ? "noopener noreferrer" : rest.rel}
  aria-current={active ? "page" : undefined}
  class={[variants[variant], active && activeVariants[variant], className]}
>
  {@render children()}
</a>
