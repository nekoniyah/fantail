import { Router } from "express";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth";
import type { User } from "@prisma";
import { sendError, sendData } from "@lib/responses";
import { cache, USER_TTL_MS } from "@lib/cache";

const router = Router();

router.get("/", auth, async (req, res) => {
  const filter = req.query.filter as string;
  const allUsers = await prisma.user.findMany({
    omit: {
      password: true,
      email: true,
    },
  });

  if (!filter) return sendData(res, 200, allUsers);

  const filteredUsers = allUsers.filter(
    (user) =>
      user.username.includes(filter) || user.displayName?.includes(filter),
  );

  sendData(res, 200, filteredUsers);
});

router.get("/:id", async (req, res, next) => {
  const id = req.params.id;

  if (id === "@me") {
    await auth(req, res, next);
    sendData(res, 200, (req as any).user as User);
    return;
  }

  if (id.startsWith("@")) {
    const username = id.replace("@", "");
    const account = await prisma.user.findFirst({
      where: {
        username,
      },
      omit: {
        password: true,
        email: true,
      },
    });

    if (!account) return sendError(res, 404, "User not found");
    sendData(res, 200, account);
    return;
  }

  const account =
    cache.get(`user:${id}`) ??
    (await prisma.user.findUnique({
      where: {
        id,
      },
      omit: {
        password: true,
        email: true,
      },
    }));

  if (!account) return sendError(res, 404, "User not found");
  cache.set(`user:${id}`, account, USER_TTL_MS);
  sendData(res, 200, account);
});

export default router;
