import {Router} from "express"
import prisma from "@lib/prisma.ts";

const router = Router()

router.get("/:id", async (req, res) => {
    const avatar = await prisma.avatar.findFirst({where: {userId: req.params.id}})

    res.set("Cross-Origin-Resource-Policy", "cross-origin")
    if (!avatar) return res.status(404).send("Avatar not found")

    const buffer = Buffer.from(avatar.data, "base64")

    res.set("Content-Type", `image/${avatar.format}`)
    res.send(buffer)
})

export default router