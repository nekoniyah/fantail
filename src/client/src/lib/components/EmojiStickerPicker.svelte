<script lang="ts">
  import { ensureMyMedia, myLibrary, myMedia } from "#lib/mediaLibrary.ts";
  import { mediaUrl } from "#lib";
  import Tabs from "./Tabs.svelte";
  import type { LibraryKind, MediaItem } from "#lib/types.ts";

  interface Props {
    /** Called when an item is picked; for stickers the payload is its Media id */
    onpick: (item: MediaItem) => void;
  }

  let { onpick }: Props = $props();

  const pickerTabs = [
    { id: "emoji", label: "Emoji" },
    { id: "stickers", label: "Stickers" },
  ] as const;
  type PickerTab = (typeof pickerTabs)[number]["id"];

  let tab = $state<PickerTab>("emoji");

  const items = $derived.by(() => {
    const kind: LibraryKind = tab === "emoji" ? "emote" : "sticker";
    return myLibrary($myMedia, kind);
  });

  $effect(() => {
    void ensureMyMedia();
  });
</script>

<div class="w-72 rounded-box border-2 border-neutral bg-base-100 shadow-[0_4px_0_0_var(--color-neutral)]">
  <div class="p-2">
    <Tabs bind:active={tab} tabs={pickerTabs} idPrefix="picker-tabs" label="Pick emoji or stickers" />
  </div>
  <div class="max-h-64 grid grid-cols-4 gap-2 overflow-y-auto p-2">
    {#each items as item (item.id)}
      <button
        type="button"
        aria-label={item.name || "Pick"}
        title={item.name}
        class="aspect-square rounded-box border-2 border-transparent object-contain hover:border-primary"
        onclick={() => onpick(item)}
      >
        <img
          src={mediaUrl(item.id)}
          alt={item.name || "Picker item"}
          class="size-full object-contain"
          loading="lazy"
        />
      </button>
    {:else}
      <p class="col-span-4 py-6 text-center text-sm opacity-70">
        {tab === "emoji" ? "No emoji in your library yet." : "No stickers yet."}
        <br />
        Add some from your profile!
      </p>
    {/each}
  </div>
</div>
