import {API_ROOT} from "#lib/index.ts";
import {get} from "svelte/store";
import {token} from "#lib/stores.ts";
import type {PublicUser} from "#lib/types.ts";

export async function updateAvatar(avatar: File) {
    const formData = new FormData();
    formData.append("avatar", avatar);
    return await fetch(`${API_ROOT}/users/@me/avatar`, {
        method: "PUT",
        body: formData,
        headers: {
            "Authorization": `Bearer ${get(token)}`,
        },
    })
}

export async function fetchSentInvitations() {
    return await fetch(`${API_ROOT}/friends/invitations/sent`, {
        headers: {
            "Authorization": `Bearer ${get(token)}`,
        },
    })
}

export async function fetchInvitations() {
    return await fetch(`${API_ROOT}/friends/invitations`, {
        headers: {
            "Authorization": `Bearer ${get(token)}`,
        },
    })
}

export async function fetchFilteredUsers(filter: string): Promise<PublicUser[]> {
    const response = await fetch(encodeURI(`${API_ROOT}/users?filter=${filter || ''}`), {headers: {Authorization: `Bearer ${get(token)}`}})
    return await response.json()
}

export async function createFriendRequest(id: string) {
    return await fetch(`${API_ROOT}/friends/invitations`, {
        method: "POST",
        body: JSON.stringify({targetId: id}),
        headers: {
            "Authorization": `Bearer ${get(token)}`,
            "Content-Type": "application/json"
        },
    })
}