import {writable} from "svelte/store";
import type {PrivateUser} from "#lib/types.ts";

export const user = writable<PrivateUser | null>(null);
export const token = writable<string | null>(null);
export const sentInvitations = writable<any[]>();
export const invitations = writable<any[]>();