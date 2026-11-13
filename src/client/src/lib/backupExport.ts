// #lib/backupExport.ts
// Identity backup export: download as a file and/or copy to the clipboard,
// plus an out-of-band fingerprint so the user can verify both devices match.

import { exportIdentityBackup, fingerprint } from "#lib/crypto.ts";

export interface BackupPayload {
  /** The passphrase-encrypted identity record (JSON string). */
  backup: string;
  /** Human-comparable fingerprint of the exported public keys. */
  fingerprint: string;
}

/**
 * Reads the stored identity from IndexedDB and returns the encrypted backup
 * plus its fingerprint. Throws if no identity is stored on this device.
 * The identity may be locked: the backup is the still-encrypted record.
 */
export async function getBackupPayload(userId: string): Promise<BackupPayload> {
  const backup = await exportIdentityBackup(userId);
  const rec = JSON.parse(backup) as {
    publicKey: string;
    signingPublicKey: string;
  };
  return {
    backup,
    fingerprint: fingerprint(rec.publicKey, rec.signingPublicKey),
  };
}

/** Whether an identity is actually stored on this device (export is possible). */
export async function canExport(userId: string): Promise<boolean> {
  try {
    await exportIdentityBackup(userId);
    return true;
  } catch {
    return false;
  }
}

/** A copy helper that reports clipboard failure so the UI can fall back. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Triggers a browser download of the backup as a .json file. */
export function downloadBackup(backup: string, username: string) {
  const blob = new Blob([backup], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fantail-identity-backup-${username}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
