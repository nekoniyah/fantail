import { Router } from "express";
import { compareSync } from "bcrypt";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth.ts";
import type { User } from "@prisma";

const router = Router();

router.put("/", auth, async (req, res) => {
  const self = req.user as User;
  const body = req.body;

  let newPassword: string | undefined;

  if (body.password) {
    if (!body.oldPassword)
      return res.status(400).json({ message: "Old password is required" });

    // Check if old password is correct (match self.password)

    if (!compareSync(body.oldPassword, self.password))
      return res.status(400).json({ message: "Old password is incorrect" });

    newPassword = body.password;
  }

  await prisma.user.update({
    where: { id: self.id },
    data: {
      password: newPassword,
      displayName: body.displayName ? body.displayName : undefined,
      username: body.username ? body.username : undefined,
      description: body.description ? body.description : undefined,
    },
  });

  res.json({ message: "Profile updated" });
});

export default router;
