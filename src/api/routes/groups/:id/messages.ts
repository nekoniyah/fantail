import { Router } from "express";
import auth from "@middlewares/auth.ts";
import type { User } from "@prisma";
import { fetchGroup } from "../index.ts";
import prisma from "@lib/prisma.ts";
import { sendData } from "@lib/responses";

const router = Router({ mergeParams: true });

router.get("/", auth, async (req, res) => {
  const group = await fetchGroup(
    req.params.id as string,
    req.user as User,
    res,
  );

  // fetchGroup already answered (404/403) when the group is missing or forbidden
  if (!group) return;

  const messages = await prisma.groupMessage.findMany({
    where: { groupId: group.id },
    include: {
      sender: {
        omit: { password: true, token: true, email: true },
      },
    },
  });

  sendData(res, 200, messages);
});

export default router;
