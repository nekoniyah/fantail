import { Router } from "express";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth";
import type { User } from "@prisma";

import * as Iron from "iron-webcrypto";

const router = Router();

// This route is used to establish a connection between the authentication server (Fantail server) and the target Fantail instance.

router.get("/", auth, async (req, res) => {});

router.post("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const identity = await Iron.seal(
    {
      id: user.id,
      username: user.username,
      token: user.token,
      password: user.password,
    },
    user.token,
    Iron.defaults,
  );

  await prisma.trustedSession.create({
    data: {
      user: { connect: { id: user.id } },
      identity: identity,
    },
  });
});

/** For the Fantail instance,
 * this route is used to verify the integrity and the indentity of the user and connections between this server and the instance.
 */

router.post("/verify", async (req, res) => {
  const identity = req.body.identity;
  const userId = req.body.userId;

  if (!identity || !userId)
    return res.status(400).json({
      success: false,
      message: "Missing identity or userId",
    });

  const account = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!account)
    return res.status(404).json({
      success: false,
      message: "Account not found",
    });

  const sessions = await prisma.trustedSession.findMany({
    where: {
      userId: account.id,
      identity: identity,
    },
    orderBy: { createdAt: "desc" },
  });

  if (sessions.length === 0)
    return res.status(404).json({
      success: false,
      message: "No trusted sessions found for this identity",
    });

  const latestSession = sessions[0]!;

  if (latestSession.used)
    return res.status(400).json({
      success: false,
      message: "This identity has already been used",
    });

  if (latestSession.identity !== identity)
    return res.status(400).json({
      success: false,
      message: "Invalid identity",
    });

  await prisma.trustedSession.update({
    where: {
      id: latestSession.id,
    },
    data: {
      used: true,
    },
  });

  res.status(200).json({
    success: true,
    message: "Identity verified successfully",
  });
});

export default router;
