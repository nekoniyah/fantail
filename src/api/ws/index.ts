import type { Server } from "http";
import { Server as IOServer } from "socket.io";

export default function createIO(server: Server) {
  return new IOServer(server, { cors: {} });
}
