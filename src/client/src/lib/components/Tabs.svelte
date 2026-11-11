<script lang="ts" generics="T extends string">
  interface TabItem {
    id: T;
    label: string;
  }

  interface Props {
    tabs: readonly TabItem[];
    active: T;
    /** Accessible name for the tab list */
    label?: string;
    /** Prefix for element ids: tabs get `${idPrefix}-tab-${id}`, panels should be `${idPrefix}-panel-${id}` */
    idPrefix?: string;
    class?: string;
    /** Called only when the user picks a tab (not on first render) */
    onchange?: (id: T) => void;
  }

  let {
    tabs,
    active = $bindable(),
    label = "Sections",
    idPrefix = "tabs",
    class: className = "",
    onchange,
  }: Props = $props();

  function select(id: T) {
    if (id === active) return;
    active = id;
    onchange?.(id);
  }

  // Arrow keys / Home / End move between tabs, as in the ARIA tabs pattern
  function handleKeydown(ev: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    let next: number | undefined;

    if (ev.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (ev.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (ev.key === "Home") next = 0;
    else if (ev.key === "End") next = last;

    if (next === undefined) return;

    ev.preventDefault();
    select(tabs[next]!.id);
    document.getElementById(`${idPrefix}-tab-${tabs[next]!.id}`)?.focus();
  }
</script>

<div
  role="tablist"
  aria-label={label}
  class={[
    "tabs w-full gap-1 overflow-x-auto rounded-full border-2 border-neutral bg-base-200 p-1 shadow-[0_4px_0_0_var(--color-neutral)] tabs-box",
    className,
  ]}
>
  {#each tabs as tab, i (tab.id)}
    {@const isActive = tab.id === active}
    <button
      type="button"
      role="tab"
      id="{idPrefix}-tab-{tab.id}"
      aria-selected={isActive}
      aria-controls="{idPrefix}-panel-{tab.id}"
      tabindex={isActive ? 0 : -1}
      class={[
        "tab h-10 flex-1 rounded-full font-bold whitespace-nowrap transition-all",
        isActive
          ? "tab-active bg-primary text-primary-content shadow-[0_2px_0_0_var(--color-neutral)]"
          : "hover:bg-secondary/60",
      ]}
      onclick={() => select(tab.id)}
      onkeydown={(ev) => handleKeydown(ev, i)}
    >
      {tab.label}
    </button>
  {/each}
</div>
