import { API_ROOT } from "#lib/index.ts";
import { get } from "svelte/store";
import { token } from "#lib/stores.ts";
import type { PrivateUser, PublicUser } from "#lib/types.ts";

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
  return await response.json();
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
