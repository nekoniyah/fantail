import {Router} from "express"
import prisma from "@lib/prisma.ts";
import { sendError, sendData } from "@lib/responses";
import { cached, AVATAR_TTL_MS } from "@lib/cache";

const router = Router()

router.get("/:id", async (req, res) => {
    const userId = req.params.id
    const avatar = await cached(`avatar:${userId}`, AVATAR_TTL_MS, () =>
        prisma.avatar.findFirst({where: {userId}}),
    )

    res.set("Cross-Origin-Resource-Policy", "cross-origin")
    if (!avatar) return sendError(res, 404, "Avatar not found")

    res.set("Content-Type", `image/${avatar.format}`)
    res.send(Buffer.from(avatar.data, "base64"))
})

export default router