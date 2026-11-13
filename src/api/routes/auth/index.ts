import { Router } from "express";
import prisma from "@lib/prisma";
import { compareSync, hashSync } from "bcrypt";

import * as Iron from "iron-webcrypto";
import { z } from "zod";
import { sendError, sendMessage, sendData } from "@lib/responses";

const router = Router();

const passwordSalt = Number(process.env.PASSWORD_SALT);

const loginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string(),
});

const registerSchema = z.object({
  email: z.nullable(z.email().optional()),
  username: z
    .string({
      error: "Username must be between 4 and 20 characters. Must be lowercase.",
    })
    .min(4)
    .max(20)
    .lowercase(),
  password: z
    .string({
      error:
        "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character",
    })
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    ),
});

router.post("/login", async (req, res) => {
  if (!req.body) {
    sendError(res, 400, "Request body is empty");
    return;
  }

  const { data, success, error } = await loginSchema.safeParseAsync(req.body);

  if (!success)
    return sendError(res, 400, error.message);

  const { emailOrUsername, password } = data;

  const account = await prisma.user.findFirst({
    where: {
      OR: [{ username: emailOrUsername }, { email: emailOrUsername }],
    },
  });

  if (!account)
    return sendError(
      res,
      404,
      "Account with email or username does not exist",
    );

  if (!compareSync(password, account.password))
    return sendError(res, 401, "Invalid password");

  const key = req.cookies["fantail_private_key"] as string;
  const expirationMs = req.cookies["fantail_expiration"] as string;

  if (!key || !expirationMs)
    return sendError(res, 400, "Missing key or expiration");

  const expiration = new Date(Date.now() + Number(expirationMs));

  const token = await Iron.seal(
    {
      id: account.id,
      username: account.username,
    },
    key,
    Iron.defaults,
  );

  const session = await prisma.session.create({
    data: {
      user: { connect: { id: account.id } },
      token,
      expiresAt: expiration,
    },
  });

  sendData(res, 200, {
    message: "Successfully logged in",
    session,
  });
});

router.post("/register", async (req, res) => {
  if (!req.body)
    return sendError(res, 400, "Request body is empty");

  const { data, success, error } = registerSchema.safeParse(req.body);

  if (!success)
    return sendError(res, 400, (error.issues[0] as any).message);

  const { email, password, username } = data;

  let account = await prisma.user.findFirst({ where: { username } });

  if (!account && email)
    account = await prisma.user.findFirst({ where: { email } });

  if (account)
    return sendError(res, 409, "Account with email or username already exists");

  const hashedPassword = hashSync(password, passwordSalt);

  account = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      email: email ? email : undefined,
    },
  });

  res.locals.user = account;

  sendMessage(res, 201, "Successfully created account.");
});

export default router;
