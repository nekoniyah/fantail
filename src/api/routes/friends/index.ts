import { Router } from "express";
import auth from "@middlewares/auth.ts";
import type { User } from "@prisma";
import prisma from "@lib/prisma.ts";
import { sendError, sendData, sendMessage } from "@lib/responses";

const router = Router();

router.get("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const userWithFriends = await prisma.user.findFirst({
    where: { id: user.id },
    include: {
      friends: { omit: { email: true, password: true } },
    },
  });

  if (!userWithFriends)
    return sendError(res, 404, "User not found");

  return sendData(res, 200, userWithFriends.friends);
});

// Remove friend from friend list

router.delete("/:id", auth, async (req, res) => {
  const user = (req as any).user as User;
  const friendId = req.params.id as string;

  const userWithFriends = await prisma.user.findFirst({
    where: { id: user.id },
    include: {
      friends: { omit: { email: true, password: true } },
    },
  });

  if (!userWithFriends)
    return sendError(res, 404, "User not found");

  const friend = userWithFriends.friends.find(
    (friend) => friend.id === friendId,
  );

  if (!friend) return sendError(res, 404, "Friend not found");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      friends: {
        disconnect: { id: friendId },
      },
    },
  });

  return sendMessage(res, 200, "Friend removed");
});

export default router;
