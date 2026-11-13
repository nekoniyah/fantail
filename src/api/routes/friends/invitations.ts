import { Router } from "express";
import auth from "@middlewares/auth.ts";
import type { User } from "@prisma";
import prisma from "@lib/prisma.ts";
import { sendError, sendData, sendMessage } from "@lib/responses";

const router = Router();

router.get("/sent", auth, async (req, res) => {
  const user = (req as any).user as User;

  const invitations = await prisma.friendInvitation.findMany({
    where: {
      senderId: user.id,
    },
  });

  sendData(res, 200, invitations);
});

router.get("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const invitations = await prisma.friendInvitation.findMany({
    where: {
      targetId: user.id,
    },
  });

  sendData(res, 200, invitations);
});

router.post("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const targetId = req.body.targetId as string;

  if (user.id === targetId)
    return sendError(
      res,
      400,
      "You cannot send a friend request to yourself",
    );

  const targetUser = await prisma.user.findUnique({
    where: {
      id: targetId,
    },
  });

  if (!targetUser) return sendError(res, 404, "User not found");

  const isAlreadyFriends = await prisma.user.findFirst({
    where: {
      id: user.id,
      friends: {
        some: {
          id: targetId,
        },
      },
    },
  });

  if (isAlreadyFriends)
    return sendError(res, 400, "You are already friends with this user");

  const existingInvitation = await prisma.friendInvitation.findFirst({
    where: {
      targetId,
      senderId: user.id,
    },
  });

  if (existingInvitation)
    return sendError(
      res,
      400,
      "You already sent a friend request to this user",
    );

  await prisma.friendInvitation.create({
    data: {
      senderId: user.id,
      targetId,
    },
  });

  sendMessage(res, 201, "Friend request sent");
});

// Cancel or deny a friend request

router.delete("/:id", auth, async (req, res) => {
  const user = (req as any).user as User;
  const id = req.params.id as string;

  const myInvitation = await prisma.friendInvitation.findUnique({
    where: {
      id,
    },
  });

  if (!myInvitation)
    return sendError(res, 404, "Invitation not found");

  console.log(myInvitation.targetId, myInvitation.senderId, user.id);

  let validated = false;

  if (myInvitation.targetId === user.id) validated = true;
  if (myInvitation.senderId === user.id) validated = true;

  if (validated) {
    await prisma.friendInvitation.delete({
      where: {
        id,
      },
    });

    sendMessage(res, 200, "Invitation deleted");
  } else
    sendError(
      res,
      403,
      "You are not the target or sender of this invitation",
    );
});

// Accept a friend request

router.post("/:id", auth, async (req, res) => {
  const user = (req as any).user as User;
  const id = req.params.id as string;
  const invitation = await prisma.friendInvitation.findUnique({
    where: { id },
  });

  if (!invitation)
    return sendError(res, 404, "Invitation not found");

  if (invitation.targetId !== user.id)
    return sendError(res, 403, "You are not the target of this invitation");

  // Delete the invitation and add friend to friend list

  await prisma.friendInvitation.delete({ where: { id } });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      friends: {
        connect: {
          id: invitation.senderId,
        },
      },
    },
  });

  await prisma.user.update({
    where: { id: invitation.senderId },
    data: {
      friends: { connect: { id: invitation.targetId } },
    },
  });

  return sendMessage(res, 200, "Invitation accepted");
});

export default router;
