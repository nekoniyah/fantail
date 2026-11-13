import type { Handler } from "express";
import prisma from "@lib/prisma.ts";
import { sendError } from "@lib/responses";
import { cached, SESSION_TTL_MS } from "@lib/cache";

const auth: Handler = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  // A missing token must 401, never fall through: Prisma drops `undefined`
  // filters, so `where: { token: undefined }` would match ANY session row.
  if (!token) return sendError(res, 401, "Unauthorized");

  const session = await cached(`session:${token}`, SESSION_TTL_MS, () =>
    prisma.session.findFirst({
      where: { token },
      include: { user: true },
    }),
  );
  if (!session) return sendError(res, 401, "Unauthorized");
  req.user = session.user;

  next();
};

export default auth;
