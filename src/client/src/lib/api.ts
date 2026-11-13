import { API_ROOT } from "#lib/index.ts";
import { get } from "svelte/store";
import { token } from "#lib/stores.ts";
import type {
  LibraryKind,
  MediaItem,
  PrivateUser,
  PublicUser,
} from "#lib/types.ts";

const headers = () => {
  return { Authorization: `Bearer ${get(token)}` };
};

export async function updateAvatar(avatar: File) {
  const formData = new FormData();
  formData.append("avatar", avatar);
  return await fetch(`${API_ROOT}/users/@me/avatar`, {
    method: "PUT",
    body: formData,
    headers: headers(),
  });
}

export async function fetchSentInvitations() {
  const response = await fetch(`${API_ROOT}/friends/invitations/sent`, {
    headers: headers(),
  });
  if (!response.ok) return null;
  return await response.json();
}

export async function fetchInvitations() {
  const response = await fetch(`${API_ROOT}/friends/invitations`, {
    headers: headers(),
  });

  if (!response.ok) return null;
  return await response.json();
}

export async function fetchFilteredUsers(
  filter: string,
): Promise<PublicUser[]> {
  const response = await fetch(
    encodeURI(`${API_ROOT}/users?filter=${filter || ""}`),
    {
      headers: headers(),
    },
  );

  return await response.json();
}

export async function fetchUser(id: string): Promise<PublicUser> {
  const response = await fetch(`${API_ROOT}/users/${id}`, {
    headers: headers(),
  });
  return await response.json();
}

export async function createFriendRequest(id: string) {
  return await fetch(`${API_ROOT}/friends/invitations`, {
    method: "POST",
    body: JSON.stringify({ targetId: id }),
    headers: {
      ...headers(),
      "Content-Type": "application/json",
    },
  });
}

export async function fetchGroups(): Promise<any[] | null> {
  const response = await fetch(`${API_ROOT}/groups`, {
    headers: headers(),
  });
  if (!response.ok) return null;
  let res = await response.json();

  res = await Promise.all(
    res.map(async (group: any) => {
      group.owner = await fetchUser(group.ownerId);
      return group;
    }),
  );

  return res;
}

export async function fetchGroup(id: string): Promise<any> {
  const response = await fetch(`${API_ROOT}/groups/${id}`, {
    headers: headers(),
  });
  if (!response.ok) return null;
  return await response.json();
}

export async function fetchFriends(): Promise<PublicUser[] | null> {
  const response = await fetch(`${API_ROOT}/friends`, {
    headers: headers(),
  });
  if (!response.ok) return null;
  return await response.json();
}

export async function createGroup(members: string[]) {
  return await fetch(`${API_ROOT}/groups`, {
    method: "POST",
    body: JSON.stringify({ members }),
    headers: {
      ...headers(),
      "Content-Type": "application/json",
    },
  });
}

export async function fetchMe(): Promise<PrivateUser | null> {
  const response = await fetch(`${API_ROOT}/users/@me`, {
    headers: headers(),
  });
  return response.ok ? await response.json() : null;
}
export async function deleteGroup(id: string) {
  return await fetch(`${API_ROOT}/groups/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
}

export async function fetchNotifications(): Promise<any[] | null> {
  const response = await fetch(`${API_ROOT}/notifications`, {
    headers: headers(),
  });
  if (!response.ok) return null;
  return await response.json();
}

export async function markNotificationAsRead(id: string) {
  return await fetch(`${API_ROOT}/notifications/${id}/read`, {
    method: "POST",
    headers: headers(),
  });
}

// Plaintext upload: for emotes, stickers and other shared library items.
export async function uploadAttachment(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_ROOT}/files`, {
    method: "POST",
    body: formData,
    headers: headers(),
  });

  if (res.ok) {
    return (await res.json()) as { path: string; media: any };
  } else return (await res.json()) as { message: string; media?: any };
}

// ── User media library (emotes & stickers) ──

export async function fetchMyMedia(): Promise<MediaItem[] | null> {
  const res = await fetch(`${API_ROOT}/users/@me/media`, {
    headers: headers(),
  });
  if (!res.ok) return null;
  return (await res.json()) as MediaItem[];
}

/**
 * Adds a file to the user library as an emote or sticker.
 * Returns the created entry, or the error message sent by the API
 * (duplicate upload, bad type, too large…).
 */
export async function addLibraryItem(
  kind: LibraryKind,
  file: File,
  name?: string,
): Promise<{ ok: true; item: MediaItem } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);

  const res = await fetch(`${API_ROOT}/users/@me/media/${kind}`, {
    method: "POST",
    body: formData,
    headers: headers(),
  });

  if (res.ok) return { ok: true, item: (await res.json()) as MediaItem };

  const body = (await res.json().catch(() => null)) as {
    message?: string;
  } | null;
  return { ok: false, error: body?.message ?? "Upload failed" };
}

export async function removeLibraryItem(id: string): Promise<boolean> {
  const res = await fetch(
    `${API_ROOT}/users/@me/media/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: headers(),
    },
  );
  return res.ok;
}

// Encrypted upload: `upload` is what encryptAttachment() returns. Sent as
// multipart (raw ciphertext + nonce); the server stores it as an opaque Media
// row (type "attachment"). Throws on network errors, like fetch.
export async function uploadEncryptedAttachment(upload: {
  data: Uint8Array; // ciphertext
  nonce: string; // base64
}) {
  const formData = new FormData();
  formData.append("nonce", upload.nonce);
  formData.append(
    "file",
    new Blob([upload.data as BlobPart], { type: "application/octet-stream" }),
    "attachment.bin",
  );

  const res = await fetch(`${API_ROOT}/files/attachments`, {
    method: "POST",
    body: formData,
    headers: headers(),
  });

  if (res.ok) {
    return (await res.json()) as { path: string; media: { id: string } };
  }
  return (await res.json().catch(() => ({ message: "Upload failed" }))) as {
    message: string;
  };
}
