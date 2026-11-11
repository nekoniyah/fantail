import type { Handler } from "express";
import prisma from "@lib/prisma.ts";

const auth: Handler = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  const session = await prisma.session.findFirst({
    where: { token },
    include: { user: true },
  });
  if (!session) return res.status(401).json({ message: "Unauthorized" });
  req.user = session.user;

  next();
};

export default auth;
