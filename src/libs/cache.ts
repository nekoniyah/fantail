// Process-wide in-memory cache with TTL and an LRU byte cap.
// Keys are namespaced by resource: "session:<token>", "avatar:<userId>", "media:<id>".
// Write paths must invalidate explicitly: cache.del(key) / cache.delPrefix(prefix),
// or via the helpers below (invalidateAvatar).
// Single-process only: if Fantail ever runs multiple instances, swap the
// internals for a shared store (e.g. Redis), the call sites can stay as-is.

/** Seconds a cached session stays valid. Logout must invalidate explicitly. */
export const SESSION_TTL_MS = 15 * 1000;

type Entry = {
  value: unknown;
  bytes: number;
  expiresAt: number;
};

// Enough for a few hundred avatars/attachments, not the whole database
const MAX_BYTES = 64 * 1024 * 1024;
// Drop expired entries even if nobody reads them again
const SWEEP_INTERVAL_MS = 60 * 1000;

/** Milliseconds an avatar stays cached. Avatars are invalidated on upload. */
export const AVATAR_TTL_MS = 5 * 60 * 1000;

/** Milliseconds a media row (emote/sticker/attachment) stays cached.
 * Media ids are immutable (uploads create new rows), so no invalidation is
 * needed except when a row is deleted with its message. */
export const MEDIA_TTL_MS = 10 * 60 * 1000;

/** Drops the cached avatar for a user; called after an avatar upload. */
export function invalidateAvatar(userId: string): void {
  cache.del(`avatar:${userId}`);
}

/** Milliseconds a public user row stays cached (user:id lookups, e.g. group owners). */
export const USER_TTL_MS = 15 * 1000;

class Cache {
  private store = new Map<string, Entry>();
  private bytes = 0;

  constructor() {
    const timer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    timer.unref?.();
  }

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.del(key);
      return undefined;
    }

    // Re-insert to refresh recency (Maps iterate in insertion order)
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number = 30_000): void {
    if (ttlMs <= 0) return;

    const previous = this.store.get(key);
    if (previous) {
      this.bytes -= previous.bytes;
      this.store.delete(key);
    }

    const entry: Entry = {
      value,
      bytes: this.estimateBytes(value),
      expiresAt: Date.now() + ttlMs,
    };

    this.store.set(key, entry);
    this.bytes += entry.bytes;
    this.evict();
  }

  del(key: string): void {
    const entry = this.store.get(key);
    if (!entry) return;

    this.bytes -= entry.bytes;
    this.store.delete(key);
  }

  delPrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.del(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.store.size;
  }

  // Only count what can actually be big; small JSON rows are billed a token amount
  private estimateBytes(value: unknown): number {
    if (value instanceof Buffer) return value.byteLength;
    if (typeof value === "string") return value.length;
    return 64;
  }

  private evict(): void {
    while (this.bytes > MAX_BYTES && this.store.size > 1) {
      const oldest = this.store.keys().next().value as string;
      this.del(oldest);
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.del(key);
    }
  }
}

export const cache = new Cache();

/** Get-or-load helper: returns the cached value or loads, stores and returns it. */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const hit = cache.get<T>(key);
  if (hit !== undefined) return hit;

  const value = await load();
  if (value !== null && value !== undefined) cache.set(key, value, ttlMs);
  return value;
}
