<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  type Size = "xs" | "sm" | "md" | "lg";

  interface Props extends Omit<HTMLInputAttributes, "size"> {
    label?: string;
    hint?: string;
    error?: string;
    size?: Size;
  }

  let {
    label,
    hint,
    error,
    size = "md",
    type = "text",
    id,
    value = $bindable(),
    class: className = "",
    ...rest
  }: Props = $props();

  const uid = $props.id();
  const inputId = $derived(id ?? uid);
  const messageId = $derived(`${inputId}-msg`);

  const sizes: Record<Size, string> = {
    xs: "input-xs",
    sm: "input-sm",
    md: "input-md",
    lg: "input-lg",
  };
</script>

<fieldset class="fieldset w-full">
  {#if label}
    <label for={inputId} class="fieldset-legend font-bold text-base-content"
      >{label}</label
    >
  {/if}

  <input
    {...rest}
    {type}
    id={inputId}
    bind:value
    aria-invalid={error ? true : undefined}
    aria-describedby={error || hint ? messageId : undefined}
    class={[
      "input w-full border-2 border-neutral bg-base-100 transition-all",
      "focus:-translate-y-0.5 focus:border-primary focus:shadow-[0_4px_0_0_var(--color-primary)] focus:outline-none",
      sizes[size],
      error && "input-error",
      className,
    ]}
  />

  {#if error}
    <p id={messageId} class="label font-bold text-error">{error}</p>
  {:else if hint}
    <p id={messageId} class="label text-base-content/70">{hint}</p>
  {/if}
</fieldset>
