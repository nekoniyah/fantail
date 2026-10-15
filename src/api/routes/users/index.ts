import {Router} from "express";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth";

const router = Router();

router.get("/", auth, async (req, res) => {
    const filter = req.query.filter as string
    const allUsers = await prisma.user.findMany({
        omit: {
            token: true,
            password: true,
            email: true
        }
    })

    if (!filter) return res.json(allUsers);

    const filteredUsers = allUsers.filter(user => user.username.includes(filter) || user.displayName?.includes(filter))
    return res.json(filteredUsers);
})

router.get("/:id", async (req, res, next) => {
    const id = req.params.id;

    if (id === "@me") {
        await auth(req, res, next)
        res.json(req.user)
        return
    }

    if (id.startsWith("@")) {
        const username = id.replace("@", "")
        const account = await prisma.user.findFirst({
            where: {
                username,
            },
            omit: {
                token: true,
                password: true,
                email: true
            }
        });

        if (!account) return res.status(404).json({error: "User not found"})
        res.json(account)
        return;
    }

    const account = await prisma.user.findUnique({
        where: {
            id,
        },
        omit: {
            token: true,
            password: true,
            email: true
        }
    });

    if (!account) return res.status(404).json({error: "User not found"})
    res.json(account)

})

export default router;