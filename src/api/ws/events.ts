import FantailLogger from "@fantail/logger";
import prisma from "@lib/prisma";
import { Server } from "socket.io";
import { listenWebsocketGroupEvents } from "./groups";

export default function listenEvents(io: Server) {
  FantailLogger.info(`Started WebSocket Server.`);

  io.on("connection", async (socket) => {
    const token = socket.handshake.auth.token as string | null;

    function invalidate() {
      socket.emit("disconnect", { message: "Invalid token." });
      socket.disconnect(true);
    }

    if (!token) return invalidate();
    const user = await prisma.user.findFirst({ where: { token } });
    if (!user) return invalidate();

    await listenWebsocketGroupEvents(socket, user, io);
  });
}
