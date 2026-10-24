import type { Socket } from "socket.io";
import type { Group, GroupMessage, User } from "@prisma";
import prisma from "@lib/prisma";
import { Server } from "socket.io";

export async function listenWebsocketGroupEvents(
  socket: Socket,
  user: User,
  io: Server,
) {
  let group: any = null;

  socket.on(
    "group:select",
    async (
      groupId: string,
      callback: (res: false | Group) => Promise<void>,
    ) => {
      const dbGroup = await prisma.group.findFirst({
        where: { id: groupId },
        include: {
          members: { omit: { email: true, token: true, password: true } },
        },
      });

      if (!dbGroup) return callback(false);

      if (
        dbGroup.ownerId === user.id ||
        dbGroup.members.find((member) => member.id === user.id)
      ) {
        group = dbGroup;
        socket.join(`group:${group.id}`);
        await callback(dbGroup);
      } else {
        await callback(false);
      }
    },
  );

  socket.on(
    `group:messages:retrieve`,
    async (callback: (messages: GroupMessage[] | null) => Promise<void>) => {
      if (!group) return callback(null);

      const messages = await prisma.groupMessage.findMany({
        where: { groupId: group.id },
        orderBy: { createdAt: "asc" },
        include: {
          attachments: true,
          sender: { omit: { password: true, token: true, email: true } },
        },
      });

      await callback(messages);
    },
  );

  socket.on("group:messages:send", async (content: string) => {
    if (!group) return;

    const message = await prisma.groupMessage.create({
      data: {
        group: { connect: { id: group.id } },
        content,
        sender: { connect: { id: user.id } },
      },
      include: {
        sender: { omit: { password: true, token: true, email: true } },
        attachments: true,
        group: true,
      },
    });

    io.sockets.in(`group:${group.id}`).emit(`group:messages:send`, message);
  });

  socket.on("group:messages:delete", async (messageId: string) => {
    const message = await prisma.groupMessage.findFirst({
      where: { id: messageId, senderId: user.id },
    });
    if (!message) return;

    if (message.senderId !== user.id) return;

    await prisma.groupMessage.delete({ where: { id: message.id } });

    io.sockets.in(`group:${group.id}`).emit(`group:messages:delete`, messageId);
  });
}
