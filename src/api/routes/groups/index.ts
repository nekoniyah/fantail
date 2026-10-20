import { Router } from "express";
import auth from "@middlewares/auth.ts";
import prisma from "@lib/prisma.ts";
import type { User } from "@prisma";
import type { Response } from "express-serve-static-core";

const router = Router();

export async function fetchGroup(id: string, user: User, res: Response) {
  const group = await prisma.group.findFirst({
    where: {
      id,
    },
    include: {
      members: { omit: { token: true, email: true, password: true } },
    },
  });

  if (!group) {
    res.status(404).json({ message: "Group not found" });
    return;
  }

  if (
    group.ownerId !== user.id ||
    !group.members.find((m) => m.id === user.id)
  ) {
    res.status(403).json({ message: "You are not a member of this group" });
    return;
  }

  return group;
}

router.get("/", auth, async (req, res) => {
  const user = req.user as User;

  const myGroups = await prisma.user.findFirst({
    where: { id: user.id },
    include: {
      groups: {
        include: {
          members: { omit: { token: true, email: true, password: true } },
          messages: true,
        },
      },
    },
  });

  const ownedGroups = await prisma.group.findMany({
    where: { ownerId: user.id },
    include: {
      members: { omit: { token: true, email: true, password: true } },
      messages: true,
    },
  });

  res.json([...(myGroups ? myGroups.groups : []), ...ownedGroups]);
});

router.get("/:id", auth, async (req, res) => {
  const id = req.params.id as string;

  const group = await fetchGroup(id, req.user as User, res);
  res.json(group);
});

router.post("/", auth, async (req, res) => {
  const user = req.user as User;

  const userWithFriends = await prisma.user.findFirst({
    where: { id: user.id },
    include: { friends: true },
  });

  if (!userWithFriends)
    return res.status(404).json({ message: "User not found" });

  const memberIds = req.body.members as string[];

  for (let memberId of memberIds) {
    const friend = userWithFriends.friends.find(
      (friend) => friend.id === memberId,
    );
    if (!friend) return res.status(404).json({ message: "Friend not found" });
  }

  await prisma.group.create({
    data: {
      ownerId: user.id,
      members: {
        connect: memberIds.map((id) => ({ id })),
      },
    },
  });

  res.status(200).json({ message: "Group created" });
});

router.delete("/:id", auth, async (req, res) => {
  const id = req.params.id as string;
  const user = req.user as User;

  const isOwner = await prisma.group.findFirst({
    where: { id, ownerId: user.id },
  });

  if (!isOwner)
    return res
      .status(403)
      .json({ message: "You are not the owner of this group" });

  await prisma.group.delete({ where: { id } });
  res.status(200).json({ message: "Group deleted" });
});

export default router;
