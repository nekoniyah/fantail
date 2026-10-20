import { WS_ROOT } from "#lib";
import { io, type Socket } from "socket.io-client";
import { get, writable } from "svelte/store";
import { token } from "./stores";

const socket = writable<Socket | null>(null);

export default function getSocket() {
  if (!get(socket))
    socket.set(
      io(WS_ROOT, {
        auth: {
          token: get(token),
        },
      }),
    );
  return get(socket)!;
}
