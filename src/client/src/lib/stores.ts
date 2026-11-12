import { writable } from "svelte/store";
import { type PublicUser, type PrivateUser } from "#lib/types.ts";

export const user = writable<PrivateUser | null>(null);
export const token = writable<string | null>(null);
export const sentInvitations = writable<any[] | null>(null);
export const invitations = writable<any[] | null>(null);
export const friends = writable<PublicUser[] | null>(null);
export const notifications = writable<any[] | null>(null);

// ── E2EE (in-memory only, never persisted; see #lib/crypto.ts) ──

/** All values base64. Null while locked / logged out. */
export interface Identity {
  publicKey: string; // X25519, uploaded to server
  signingPublicKey: string; // Ed25519, uploaded to server
  secretKey: string; // X25519 secret, never leaves the client
  signingSecretKey: string; // Ed25519 secret, never leaves the client
}

export const identity = writable<Identity | null>(null);

/** Unwrapped group keys, keyed by `${groupId}:${keyVersion}`. */
export const groupKeys = writable<Map<string, Uint8Array>>(new Map());
export const passphrase = writable<string>();
