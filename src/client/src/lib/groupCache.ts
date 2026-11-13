import { writable, get } from "svelte/store";
import type { Group } from "./types.ts";
import { fetchGroups } from "./api.ts";

/**
 * Global groups cache prefetched once at app start (root layout), so opening
 * a group feels instant: the selector and group pages read from here instead
 * of re-fetching on navigation.
 */
export const groups = writable<Group[] | null>(null);

export async function prefetchGroups(): Promise<void> {
  const fresh = await fetchGroups();
  if (fresh) groups.set(fresh);
}

export async function refreshGroups(): Promise<void> {
  await prefetchGroups();
}

export function getGroup(id: string): Group | undefined {
  return get(groups)?.find((group) => group.id === id);
}
