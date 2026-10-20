import { Router } from "express";
import prisma from "@lib/prisma.ts";
import multer from "multer";
import auth from "@middlewares/auth.ts";
import type { User } from "@prisma";

const router = Router();

const myMulter = multer({
  limits: {
    fileSize: 1024 * 1024 * 5, // 2MB
  },
});

router.put("/", auth, myMulter.single("avatar"), async (req, res) => {
  const user = req.user as User;

  const avatarData = req.file?.buffer.toString("base64") as string;

  await prisma.avatar.upsert({
    where: {
      userId: user.id as string,
    },
    create: {
      format: req.file?.mimetype.split("/")[1] as string,
      userId: user.id as string,
      data: avatarData,
    },
    update: {
      data: avatarData,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      avatarUrl: `/avatars/${user.id}`,
    },
  });

  res.status(200).json({ message: "Avatar updated successfully" });
});

export default router;
