<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  type Size = "xs" | "sm" | "md" | "lg";

  interface Props extends HTMLTextareaAttributes {
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
    rows = 4,
    id,
    value = $bindable(),
    class: className = "",
    ...rest
  }: Props = $props();

  const uid = $props.id();
  const textareaId = $derived(id ?? uid);
  const messageId = $derived(`${textareaId}-msg`);

  const sizes: Record<Size, string> = {
    xs: "textarea-xs",
    sm: "textarea-sm",
    md: "textarea-md",
    lg: "textarea-lg",
  };
</script>

<fieldset class="fieldset w-full">
  {#if label}
    <label for={textareaId} class="fieldset-legend font-bold text-base-content"
      >{label}</label
    >
  {/if}

  <textarea
    {...rest}
    {rows}
    id={textareaId}
    bind:value
    aria-invalid={error ? true : undefined}
    aria-describedby={error || hint ? messageId : undefined}
    class={[
      "textarea w-full resize-y border-2 border-neutral bg-base-100 transition-all",
      "focus:-translate-y-0.5 focus:border-primary focus:shadow-[0_4px_0_0_var(--color-primary)] focus:outline-none",
      sizes[size],
      error && "textarea-error",
      className,
    ]}></textarea>

  {#if error}
    <p id={messageId} class="label font-bold text-error">{error}</p>
  {:else if hint}
    <p id={messageId} class="label text-base-content/70">{hint}</p>
  {/if}
</fieldset>
