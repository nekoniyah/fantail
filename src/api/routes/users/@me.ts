import {Router} from "express";
import {compareSync} from "bcrypt";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth.ts";

const router = Router();

router.put("/", auth, async (req, res) => {

    if (!req.user) return res.status(401).json({error: "Unauthorized"})

    const self = req.user as Record<string, any>
    const body = req.body;

    let newPassword: string | undefined

    if (body.password) {
        if (!body.oldPassword) return res.status(400).json({error: "Old password is required"});

        // Check if old password is correct (match self.password)

        if (!compareSync(body.oldPassword, self.password))
            return res.status(400).json({error: "Old password is incorrect"});

        newPassword = body.password
    }

    await prisma.user.update({
        where: {id: self.id},
        data: {
            password: newPassword,
            displayName: body.displayName ? body.displayName : undefined,
            username: body.username ? body.username : undefined,
        }
    })

    res.json({message: "Profile updated"})
})


export default router;