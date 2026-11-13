import { Router } from "express";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth";
import type { User } from "@prisma";
import { z } from "zod";
import token from "@lib/token";
import { sendError, sendData } from "@lib/responses";

const router = Router();

// This route connects the authentication server (Fantail) to a Fantail
// community server: the user proves they logged in here, and the community
// server redeems that proof. The auth server never sends the user token and
// never carries a connection secret: `verify` answers "is this user real"
// and returns only public profile data, so the community server can verify
// the user without being able to connect on their behalf.

const TEN_MINUTES_MS = 10 * 60 * 1000;

const addressSchema = z.object({
  address: z.string().min(1).max(255),
});

// The (already authenticated) user mints a one-time ticket to hand to the
// community server they want to connect to, proving they logged in here.
router.post("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const { data, success, error } = await addressSchema.safeParseAsync(req.body);
  if (!success) return sendError(res, 400, error.message);

  // One row per (user, server) pair: minting again rotates the ticket,
  // invalidating the previous one.
  const connection = await prisma.connection.upsert({
    where: {
      userId_serverAddress: {
        userId: user.id,
        serverAddress: data.address,
      },
    },
    create: {
      userId: user.id,
      serverAddress: data.address,
      ticket: token(),
      expiresAt: new Date(Date.now() + TEN_MINUTES_MS),
    },
    update: {
      ticket: token(),
      expiresAt: new Date(Date.now() + TEN_MINUTES_MS),
    },
  });

  sendData(res, 201, {
    ticket: connection.ticket,
    expiresAt: connection.expiresAt,
  });
});

// The community server redeems the user's ticket exactly once: the row is
// deleted, so the ticket can never be replayed. No token is sent back, the
// identity and public profile are all the community server gets.
router.post("/verify", async (req, res) => {
  const { data, success, error } = await addressSchema
    .extend({ ticket: z.string().min(1) })
    .safeParseAsync(req.body);
  if (!success) return sendError(res, 400, error.message);

  const connection = await prisma.connection.findUnique({
    where: { ticket: data.ticket },
  });

  if (!connection) return sendError(res, 404, "Invalid ticket");
  if (connection.expiresAt < new Date())
    return sendError(res, 410, "Ticket expired");
  if (connection.serverAddress !== data.address)
    return sendError(res, 403, "Ticket was minted for a different server");

  const account = await prisma.user.findUnique({
    where: { id: connection.userId },
    omit: { password: true, email: true },
  });
  if (!account) return sendError(res, 404, "Account not found");

  await prisma.connection.delete({ where: { id: connection.id } });

  sendData(res, 200, { user: account });
});

export default router;
