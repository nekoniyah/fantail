import { writable } from "svelte/store";
import type { LibraryKind, MediaItem } from "#lib/types.ts";
import { fetchMyMedia } from "#lib/api.ts";

/**
 * The logged-in user's media library (custom emoji + stickers), fetched once
 * and shared by the profile page and the chat picker. `null` = not loaded.
 */
export const myMedia = writable<MediaItem[] | null>(null);

let loaded = false;

export async function ensureMyMedia(force = false): Promise<void> {
  if (loaded && !force) return;
  loaded = true;
  const items = await fetchMyMedia();
  if (items) myMedia.set(items);
}

export function invalidateMyMedia(): void {
  loaded = false;
  myMedia.set(null);
}

export function addMyMedia(item: MediaItem): void {
  myMedia.update((list) => (list ? [item, ...list] : [item]));
}

export function removeMyMedia(id: string): void {
  myMedia.update((list) => list?.filter((item) => item.id !== id) ?? null);
}

export function myLibrary(
  items: MediaItem[] | null,
  kind: LibraryKind,
): MediaItem[] {
  return items?.filter((item) => item.type === kind) ?? [];
}
