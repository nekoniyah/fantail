import { Router } from "express";
import { compareSync, hashSync } from "bcrypt";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth.ts";
import type { User } from "@prisma";
import z from "zod";
import { sendError, sendMessage } from "@lib/responses";

const router = Router();
const passwordSalt = Number(process.env.PASSWORD_SALT);

const updateSelfSchema = z.object({
  email: z.nullable(z.email().optional()),
  username: z.nullable(z.string().min(1).optional()),
  oldPassword: z.nullable(z.string().min(1).optional()),
  password: z.nullable(
    z
      .string({
        error:
          "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      })
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      )
      .optional(),
  ),
  displayName: z.nullable(z.string().min(4).optional()),
  description: z.nullable(z.string().min(1).optional()),
});

router.put("/", auth, async (req, res) => {
  const self = (req as any).user as User;
  const body = req.body;

  const { data, success, error } = await updateSelfSchema.safeParseAsync(body);

  if (!success)
    return sendError(res, 400, error.message);

  let newPassword: string | undefined;

  if (data.password) {
    if (!data.oldPassword)
      return sendError(res, 400, "Old password is required");

    // Check if old password is correct (match self.password)

    if (!compareSync(data.oldPassword, self.password))
      return sendError(res, 400, "Old password is incorrect");

    newPassword = hashSync(data.password, passwordSalt);
  }

  await prisma.user.update({
    where: { id: self.id },
    data: {
      password: newPassword,
      displayName: data.displayName ? data.displayName : undefined,
      username: data.username ? data.username : undefined,
      description: data.description ? data.description : undefined,
    },
  });

  sendMessage(res, 200, "Profile updated");
});

export default router;
