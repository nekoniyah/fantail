import { Router } from "express";
import auth from "@middlewares/auth.ts";
import prisma from "@lib/prisma.ts";
import type { User } from "@prisma";
import { sendError, sendData, sendMessage } from "@lib/responses";
import type { Response } from "express-serve-static-core";

const router = Router();

export async function fetchGroup(id: string, user: User, res: Response) {
  const group = await prisma.group.findFirst({
    where: {
      id,
    },
    include: {
      members: { omit: { email: true, password: true } },
    },
  });

  if (!group) {
    sendError(res, 404, "Group not found");
    return;
  }

  if (
    group.ownerId !== user.id ||
    !group.members.find((m) => m.id === user.id)
  ) {
    sendError(res, 403, "You are not a member of this group");
    return;
  }

  return group;
}

router.get("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const myGroups = await prisma.user.findFirst({
    where: { id: user.id },
    include: {
      groups: {
        include: {
          members: { omit: { email: true, password: true } },
        },
      },
    },
  });

  const ownedGroups = await prisma.group.findMany({
    where: { ownerId: user.id },
    include: {
      members: { omit: { email: true, password: true } },
    },
  });

  sendData(
    res,
    200,
    myGroups?.groups.concat(ownedGroups) ?? ownedGroups,
  );
});

router.get("/:id", auth, async (req, res) => {
  const id = req.params.id as string;

  const group = await fetchGroup(id, (req as any).user as User, res);

  // fetchGroup already answered (404/403) when the group is missing or forbidden
  if (!group) return;

  sendData(res, 200, group);
});

router.post("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const userWithFriends = await prisma.user.findFirst({
    where: { id: user.id },
    include: { friends: true },
  });

  if (!userWithFriends)
    return sendError(res, 404, "User not found");

  const memberIds = req.body.members as string[];

  for (let memberId of memberIds) {
    const friend = userWithFriends.friends.find(
      (friend) => friend.id === memberId,
    );
    if (!friend) return sendError(res, 404, "Friend not found");
  }

  await prisma.group.create({
    data: {
      ownerId: user.id,
      members: {
        connect: memberIds.map((id) => ({ id })),
      },
    },
  });

  sendMessage(res, 201, "Group created");
});

router.delete("/:id", auth, async (req, res) => {
  const id = req.params.id as string;
  const user = (req as any).user as User;

  const isOwner = await prisma.group.findFirst({
    where: { id, ownerId: user.id },
  });

  if (!isOwner)
    return sendError(res, 403, "You are not the owner of this group");

  await prisma.group.delete({ where: { id } });
  sendMessage(res, 200, "Group deleted");
});

export default router;
