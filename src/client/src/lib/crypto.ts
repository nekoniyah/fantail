// #lib/crypto.ts
// Client-side E2EE for groups using tweetnacl.
//
// - Identity (X25519 + Ed25519) is generated once per user, encrypted with a
//   passphrase (PBKDF2 via WebCrypto + nacl.secretbox) and persisted in IndexedDB.
// - Unlocked secrets and unwrapped group keys live ONLY in memory (Svelte stores).
//   Group keys are never persisted: they are re-unwrapped from the server-held
//   envelopes after unlock.
// - Messages are secretbox-encrypted with the group key and signed (Ed25519) over
//   (groupId, senderId, keyVersion, nonce, content).
// - Attachments get a fresh per-file key; the key, name and MIME live inside the
//   encrypted message payload. Stickers/emotes stay plaintext and are referenced
//   by id inside the payload.

import nacl from "tweetnacl";
import {
  encodeBase64,
  decodeBase64,
  decodeUTF8,
  encodeUTF8,
} from "tweetnacl-util";
import { get } from "svelte/store";
import { user, identity, groupKeys, type Identity } from "#lib/stores.ts";

// ───────────────────────────── Types ─────────────────────────────

export interface AttachmentRef {
  id: string; // Media.id (type "attachment")
  key: string; // base64 per-file secretbox key
  name: string;
  mime: string;
  size: number;
}

export interface MessagePayload {
  text: string;
  stickers?: string[]; // Media ids (type "sticker"), plaintext library items
  attachments?: AttachmentRef[];
}

/** Shape of a GroupMessage row as returned by the server. */
export interface EncryptedRow {
  content: string;
  nonce: string;
  signature: string | null;
  keyVersion: number;
  senderId: string;
  sender: { signingPublicKey: string | null };
}

export type DecryptResult =
  | { ok: true; payload: MessagePayload; legacy: boolean }
  | {
      ok: false;
      reason: "missing-key" | "bad-signature" | "decrypt-failed" | "malformed";
    };

export interface Envelope {
  userId: string;
  wrappedKey: string;
}

export class LockedError extends Error {
  constructor() {
    super("Identity is locked");
  }
}
export class WrongPassphraseError extends Error {
  constructor() {
    super("Wrong passphrase or corrupted identity");
  }
}

// ───────────────────────────── Helpers ─────────────────────────────

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function requireIdentity(): Identity {
  const id = get(identity);
  if (!id) throw new LockedError();
  return id;
}

// ───────────────────────────── Identity storage ─────────────────────────────

const DB_NAME = "e2ee";
const STORE = "identity";
const PBKDF2_ITERATIONS = 600_000;

interface StoredIdentity {
  v: 1;
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  nonce: string;
  box: string; // secretbox(JSON {secretKey, signingSecretKey})
  publicKey: string;
  signingPublicKey: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey(
    "raw",
    decodeUTF8(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations,
    },
    base,
    nacl.secretbox.keyLength * 8,
  );
  return new Uint8Array(bits);
}

async function sealIdentity(
  id: Identity,
  passphrase: string,
): Promise<StoredIdentity> {
  const salt = nacl.randomBytes(16);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const box = nacl.secretbox(
    decodeUTF8(
      JSON.stringify({
        secretKey: id.secretKey,
        signingSecretKey: id.signingSecretKey,
      }),
    ),
    nonce,
    key,
  );
  return {
    v: 1,
    kdf: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS,
    salt: encodeBase64(salt),
    nonce: encodeBase64(nonce),
    box: encodeBase64(box),
    publicKey: id.publicKey,
    signingPublicKey: id.signingPublicKey,
  };
}

async function openIdentity(
  rec: StoredIdentity,
  passphrase: string,
): Promise<Identity> {
  const key = await deriveKey(
    passphrase,
    decodeBase64(rec.salt),
    rec.iterations,
  );
  const plain = nacl.secretbox.open(
    decodeBase64(rec.box),
    decodeBase64(rec.nonce),
    key,
  );
  if (!plain) throw new WrongPassphraseError();

  const secrets = JSON.parse(encodeUTF8(plain)) as {
    secretKey: string;
    signingSecretKey: string;
  };

  // Integrity check: secrets must match the recorded public keys
  const box = nacl.box.keyPair.fromSecretKey(decodeBase64(secrets.secretKey));
  const sign = nacl.sign.keyPair.fromSecretKey(
    decodeBase64(secrets.signingSecretKey),
  );
  if (
    !equal(box.publicKey, decodeBase64(rec.publicKey)) ||
    !equal(sign.publicKey, decodeBase64(rec.signingPublicKey))
  ) {
    throw new WrongPassphraseError();
  }

  return {
    publicKey: rec.publicKey,
    signingPublicKey: rec.signingPublicKey,
    secretKey: secrets.secretKey,
    signingSecretKey: secrets.signingSecretKey,
  };
}

export async function hasStoredIdentity(userId: string): Promise<boolean> {
  return (await idb("readonly", (s) => s.get(userId))) !== undefined;
}

/**
 * First-time setup: generates keys, stores them encrypted, unlocks.
 * Upload the returned public keys to the server (User.publicKey, User.signingPublicKey).
 */
export async function setupIdentity(userId: string, passphrase: string) {
  const box = nacl.box.keyPair();
  const sign = nacl.sign.keyPair();
  const id: Identity = {
    publicKey: encodeBase64(box.publicKey),
    signingPublicKey: encodeBase64(sign.publicKey),
    secretKey: encodeBase64(box.secretKey),
    signingSecretKey: encodeBase64(sign.secretKey),
  };
  const rec = await sealIdentity(id, passphrase);
  await idb("readwrite", (s) => s.put(rec, userId));
  identity.set(id);
  return {
    publicKey: id.publicKey,
    signingPublicKey: id.signingPublicKey,
  };
}

/** Decrypts the stored identity into memory. Throws WrongPassphraseError. */
export async function unlockIdentity(userId: string, passphrase: string) {
  const rec = (await idb("readonly", (s) => s.get(userId))) as
    | StoredIdentity
    | undefined;
  if (!rec) throw new Error("No identity stored on this device");
  identity.set(await openIdentity(rec, passphrase));
}

/** Drops all secrets from memory (call on logout). */
export function lockIdentity() {
  identity.set(null);
  groupKeys.set(new Map());
}

export async function deleteStoredIdentity(userId: string) {
  await idb("readwrite", (s) => s.delete(userId));
  lockIdentity();
}

/**
 * Multi-device: returns the still-passphrase-encrypted record as a string
 * (copy/paste or QR). Import it on the other device with the same passphrase.
 */
export async function exportIdentityBackup(userId: string): Promise<string> {
  const rec = await idb("readonly", (s) => s.get(userId));
  if (!rec) throw new Error("No identity stored on this device");
  return JSON.stringify(rec);
}

export async function importIdentityBackup(
  userId: string,
  backup: string,
  passphrase: string,
) {
  const rec = JSON.parse(backup) as StoredIdentity;
  const id = await openIdentity(rec, passphrase); // validates passphrase + integrity
  await idb("readwrite", (s) => s.put(rec, userId));
  identity.set(id);
}

/** Human-comparable fingerprint of a user's public keys (compare out of band). */
export function fingerprint(
  publicKey: string,
  signingPublicKey: string,
): string {
  const h = nacl.hash(
    concat(decodeBase64(publicKey), decodeBase64(signingPublicKey)),
  );
  const hex = Array.from(h.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.match(/.{4}/g)!.join(" ");
}

// ───────────────────────────── Group keys ─────────────────────────────

const keyId = (groupId: string, version: number) => `${groupId}:${version}`;

export const newGroupKey = () => nacl.randomBytes(nacl.secretbox.keyLength);

export function cacheGroupKey(
  groupId: string,
  version: number,
  key: Uint8Array,
) {
  groupKeys.update((m) => new Map(m).set(keyId(groupId, version), key));
}

export const getGroupKey = (groupId: string, version: number) =>
  get(groupKeys).get(keyId(groupId, version));

/** Sealed-box emulation: ephemeralPub(32) | nonce(24) | box */
export function wrapKey(
  groupKey: Uint8Array,
  recipientPublicKey: string,
): string {
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ct = nacl.box(
    groupKey,
    nonce,
    decodeBase64(recipientPublicKey),
    eph.secretKey,
  );
  return encodeBase64(concat(eph.publicKey, nonce, ct));
}

export function unwrapKey(wrapped: string): Uint8Array {
  const { secretKey } = requireIdentity();
  const b = decodeBase64(wrapped);
  const key = nacl.box.open(
    b.slice(56),
    b.slice(32, 56),
    b.slice(0, 32),
    decodeBase64(secretKey),
  );
  if (!key) throw new Error("Could not unwrap group key");
  return key;
}

/** Wraps one key for every member. Throws if someone has no public key yet. */
export function buildEnvelopes(
  groupKey: Uint8Array,
  members: { id: string; publicKey?: string | null }[],
): Envelope[] {
  return members.map((m) => {
    if (!m.publicKey) throw new Error(`Member ${m.id} has no public key`);
    return { userId: m.id, wrappedKey: wrapKey(groupKey, m.publicKey) };
  });
}

/**
 * Creates (or rotates to) a new key version, caches it locally and returns what
 * to upload via "group:keys:publish". Pass the remaining members (incl. owner)
 * on removal, or all members on creation.
 */
export function createGroupKeyVersion(
  groupId: string,
  currentVersion: number,
  members: { id: string; publicKey?: string | null }[],
) {
  const version = currentVersion + 1;
  const key = newGroupKey();
  const envelopes = buildEnvelopes(key, members);
  cacheGroupKey(groupId, version, key);
  return { version, envelopes };
}

/**
 * Unwraps every envelope the server returned for this user and caches the keys.
 * Returns the newest version loaded (0 if none).
 */
export function loadEnvelopes(
  groupId: string,
  envelopes: { version: number; wrappedKey: string }[],
): number {
  let latest = 0;
  for (const e of envelopes) {
    try {
      cacheGroupKey(groupId, e.version, unwrapKey(e.wrappedKey));
      latest = Math.max(latest, e.version);
    } catch {
      console.warn(`Could not unwrap envelope v${e.version} for ${groupId}`);
    }
  }
  return latest;
}

// ───────────────────────────── Messages ─────────────────────────────

const signedBytes = (
  groupId: string,
  senderId: string,
  keyVersion: number,
  nonce: string,
  content: string,
) => decodeUTF8(`${groupId}|${senderId}|${keyVersion}|${nonce}|${content}`);

/**
 * Returns the fields to send with "group:messages:send":
 *   socket.emit("group:messages:send", content, nonce, keyVersion, signature, attachmentIds)
 */
export function encryptMessage(
  payload: MessagePayload,
  groupId: string,
  keyVersion: number,
) {
  const me = get(user);
  if (!me) throw new Error("Not logged in");
  const { signingSecretKey } = requireIdentity();

  const groupKey = getGroupKey(groupId, keyVersion);
  if (!groupKey) throw new Error(`No group key for v${keyVersion}`);

  const nonceBytes = nacl.randomBytes(nacl.secretbox.nonceLength);
  const nonce = encodeBase64(nonceBytes);
  const content = encodeBase64(
    nacl.secretbox(decodeUTF8(JSON.stringify(payload)), nonceBytes, groupKey),
  );
  const signature = encodeBase64(
    nacl.sign.detached(
      signedBytes(groupId, me.id, keyVersion, nonce, content),
      decodeBase64(signingSecretKey),
    ),
  );
  return { content, nonce, keyVersion, signature };
}

/** Never throws: a single bad message shouldn't break the whole list. */
export function decryptMessage(
  row: EncryptedRow,
  groupId: string,
): DecryptResult {
  // keyVersion 0 = legacy plaintext rows from before E2EE
  if (row.keyVersion === 0) {
    return { ok: true, payload: { text: row.content }, legacy: true };
  }

  const groupKey = getGroupKey(groupId, row.keyVersion);
  if (!groupKey) return { ok: false, reason: "missing-key" };

  const signingPub = row.sender?.signingPublicKey;
  if (!row.signature || !signingPub) {
    return { ok: false, reason: "bad-signature" };
  }

  try {
    const valid = nacl.sign.detached.verify(
      signedBytes(
        groupId,
        row.senderId,
        row.keyVersion,
        row.nonce,
        row.content,
      ),
      decodeBase64(row.signature),
      decodeBase64(signingPub),
    );
    if (!valid) return { ok: false, reason: "bad-signature" };

    const plain = nacl.secretbox.open(
      decodeBase64(row.content),
      decodeBase64(row.nonce),
      groupKey,
    );
    if (!plain) return { ok: false, reason: "decrypt-failed" };

    // The payload comes from another member: validate its shape before the UI trusts it
    const raw = JSON.parse(encodeUTF8(plain)) as Partial<MessagePayload> | null;
    if (!raw || typeof raw.text !== "string") {
      return { ok: false, reason: "malformed" };
    }
    const payload: MessagePayload = {
      text: raw.text,
      stickers: Array.isArray(raw.stickers)
        ? raw.stickers.filter((s): s is string => typeof s === "string")
        : [],
      attachments: Array.isArray(raw.attachments)
        ? raw.attachments.filter(
            (a): a is AttachmentRef =>
              !!a &&
              typeof a.id === "string" &&
              typeof a.key === "string" &&
              typeof a.name === "string" &&
              typeof a.mime === "string" &&
              typeof a.size === "number",
          )
        : [],
    };
    return { ok: true, payload, legacy: false };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

// ───────────────────────────── Attachments ─────────────────────────────

// tweetnacl works on whole buffers; cap size (or chunk) to keep memory sane.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Encrypts a file with a fresh random key.
 *  - `upload` goes to the server as a Media row (type "attachment").
 *  - `ref` (plus the Media id returned by the upload) goes INSIDE the message payload.
 */
export function encryptAttachment(
  bytes: Uint8Array,
  meta: { name: string; mime: string },
) {
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment too large");
  }
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(bytes, nonce, key);
  return {
    upload: {
      type: "attachment" as const,
      format: "bin" as const,
      data: box, // raw ciphertext bytes, uploaded as multipart (no base64 round trip)
      nonce: encodeBase64(nonce),
    },
    ref: {
      key: encodeBase64(key),
      name: meta.name,
      mime: meta.mime,
      size: bytes.length,
    } satisfies Omit<AttachmentRef, "id">,
  };
}

export function decryptAttachment(
  media: { data: string | Uint8Array; nonce: string }, // base64 string or raw ciphertext bytes
  ref: AttachmentRef,
): Uint8Array {
  const plain = nacl.secretbox.open(
    typeof media.data === "string" ? decodeBase64(media.data) : media.data,
    decodeBase64(media.nonce),
    decodeBase64(ref.key),
  );
  if (!plain) throw new Error("Attachment decryption failed");
  return plain;
}

export { encodeBase64 };
