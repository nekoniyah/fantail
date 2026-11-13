import { Router } from "express";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth";
import type { User } from "@prisma";
import { sendData } from "@lib/responses";

const router = Router();

router.get("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  let settings = await prisma.userSettings.findFirst({
    where: { userId: user.id },
  });

  if (!settings) {
    settings = await prisma.userSettings.create({
      data: { user: { connect: { id: user.id } } },
    });
  }

  sendData(res, 200, settings);
});

export default router;
