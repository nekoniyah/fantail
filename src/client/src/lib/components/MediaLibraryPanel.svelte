<script lang="ts">
  import { mediaUrl } from "#lib";
  import { Button, EmptyState, Input } from "#lib/components/index.ts";
  import type { LibraryKind, MediaItem } from "#lib/types.ts";
  import {
    ensureMyMedia,
    myLibrary,
    addMyMedia,
    removeMyMedia,
    myMedia,
  } from "#lib/mediaLibrary.ts";
  import { addLibraryItem } from "#lib/api.ts";

  interface Props {
    /** Which shelf of the library to show */
    kind: LibraryKind;
    /** Shown when the shelf is empty */
    emptyTitle: string;
    emptyDescription: string;
    /** Max images per reply grid */
    maxPerRow?: number;
    /** Rendered inside each tile if provided */
    itemAction?: (item: MediaItem) => void;
    itemActionLabel?: string;
    itemActionIcon?: string;
    /** Hide the management row (upload / delete) — read-only shelf for pickers */
    manage?: boolean;
  }

  let {
    kind,
    emptyTitle,
    emptyDescription,
    maxPerRow = 6,
    itemAction,
    itemActionLabel,
    itemActionIcon = "💬",
    manage = true,
  }: Props = $props();

  let fileInput: HTMLInputElement | undefined = $state();
  let pendingFile: File | undefined = $state();
  let itemName = $state("");
  let uploading = $state(false);
  let error = $state<string>();

  const items = $derived(myLibrary($myMedia, kind));
  const gridClass = $derived(
    maxPerRow === 4
      ? "grid-cols-4"
      : maxPerRow === 5
        ? "grid-cols-5"
        : "grid-cols-6",
  );

  $effect(() => {
    void ensureMyMedia();
  });

  function pickFile() {
    fileInput?.click();
  }

  function onFileChosen(ev: Event) {
    const target = ev.target as HTMLInputElement;
    pendingFile = target.files?.[0];
    itemName = "";
    target.value = "";
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    uploading = true;
    error = undefined;

    const res = await addLibraryItem(kind, pendingFile, itemName);

    if (res.ok) {
      addMyMedia(res.item);
      pendingFile = undefined;
      itemName = "";
    } else {
      error = res.error;
    }

    uploading = false;
  }

  function cancelUpload() {
    pendingFile = undefined;
    itemName = "";
    error = undefined;
  }

  async function deleteItem(item: MediaItem) {
    const { removeLibraryItem } = await import("#lib/api.ts");
    const ok = await removeLibraryItem(item.id);
    if (ok) removeMyMedia(item.id);
    else error = "Couldn't delete this item.";
  }

  function itemSrc(item: MediaItem) {
    return mediaUrl(item.id);
  }
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
  class="hidden"
  onchange={onFileChosen}
/>

{#if manage}
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <Button variant="outline" size="sm" onclick={pickFile}>
      + Add {kind === "emote" ? "emoji" : "sticker"}
    </Button>
  </div>
{/if}

{#if pendingFile && manage}
  <!-- Preview + name, shown as soon as a file is picked (even with an empty library) -->
  <div class="mb-4 flex flex-wrap items-end gap-3 rounded-box bg-base-200 p-4">
    <img
      src={URL.createObjectURL(pendingFile)}
      alt="Selected file"
      class="size-16 rounded-box border-2 border-neutral object-contain"
    />
    <Input
      label="Name"
      placeholder={pendingFile.name.replace(/\.[^.]+$/, "").slice(0, 32)}
      class="max-w-56"
      bind:value={itemName}
      onkeydown={(ev) => ev.key === "Enter" && void confirmUpload()}
    />
    <div class="flex gap-2">
      <Button size="sm" loading={uploading} onclick={() => void confirmUpload()}>
        Save
      </Button>
      <Button variant="ghost" size="sm" onclick={cancelUpload}>Cancel</Button>
    </div>
  </div>
{/if}

{#if items.length}
  <div class={["grid gap-3", gridClass]}>
    {#each items as item (item.id)}
      <div class="relative group">
        <img
          src={itemSrc(item)}
          alt={item.name || "Library item"}
          title={item.name}
          loading="lazy"
          class="aspect-square w-full rounded-box border-2 border-neutral bg-base-100 object-contain transition-transform hover:-translate-y-0.5"
          style="image-rendering: pixelated"
        />
        {#if itemAction}
          <button
            type="button"
            tabindex="0"
            aria-label={itemActionLabel ?? "Use"}
            title={item.name}
            class="absolute inset-0 grid cursor-pointer place-items-center rounded-box bg-neutral/60 text-2xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            onclick={() => itemAction?.(item)}
          >
            {itemActionIcon}
          </button>
        {/if}
        {#if manage}
          <button
            type="button"
            aria-label="Delete {item.name || 'item'}"
            title="Delete"
            class="btn btn-circle btn-xs absolute -top-2 -right-2 border-2 border-neutral bg-error text-error-content opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            onclick={() => void deleteItem(item)}
          >
            ✕
          </button>
        {/if}
      </div>
    {/each}
  </div>
{:else if !pendingFile}
  <EmptyState
    icon={kind === "emote" ? "😀" : "🌟"}
    title={emptyTitle}
    description={emptyDescription}
  />
{/if}

{#if error && manage}
  <p role="alert" class="mt-2 font-bold text-error">{error}</p>
{/if}
