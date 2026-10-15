import type {Handler} from "express";
import prisma from "@lib/prisma.ts";

const auth: Handler = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]

    const user = await prisma.user.findFirst({where: {token}})
    if (!user) return res.status(401).send("Unauthorized")
    req.user = user
    next()
}

export default auth