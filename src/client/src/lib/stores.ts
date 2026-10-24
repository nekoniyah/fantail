import { writable } from "svelte/store";
import { type PublicUser, type PrivateUser } from "#lib/types.ts";

export const user = writable<PrivateUser | null>(null);
export const token = writable<string | null>(null);
export const sentInvitations = writable<any[] | null>(null);
export const invitations = writable<any[] | null>(null);
export const friends = writable<PublicUser[] | null>(null);
export const notifications = writable<any[] | null>(null);
