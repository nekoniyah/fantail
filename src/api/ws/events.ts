import FantailLogger from "@fantail/logger";
import prisma from "@lib/prisma";
import { Server } from "socket.io";
import { listenWebsocketGroupEvents } from "./groups";
import { listenVoiceCallEvents } from "./voice";

export default function listenEvents(io: Server) {
  FantailLogger.info(`Started WebSocket Server.`);

  io.on("connection", async (socket) => {
    const token = socket.handshake.auth.token as string | null;

    function invalidate() {
      socket.emit("disconnect", { message: "Invalid token." });
      socket.disconnect(true);
    }

    if (!token) return invalidate();

    const session = await prisma.session.findFirst({
      where: { token },
      include: { user: true },
    });

    if (!session) return invalidate();

    const user = session.user;

    await listenWebsocketGroupEvents(socket, user, io);
    listenVoiceCallEvents(io, socket, user);
  });
}
