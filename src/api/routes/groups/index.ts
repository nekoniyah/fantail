import {Router} from 'express';
import auth from "@middlewares/auth.ts";
import prisma from "@lib/prisma.ts";
import type {User} from "@prisma";

const router = Router();


router.get("/", auth, async (req, res) => {
    const user = req.user as User;

    const myGroups = await prisma.user.findFirst({
        where: {id: user.id},
        include: {groups: {include: {members: true, messages: true}}}
    });

    res.json(myGroups);
})

router.get("/:id", auth, async (req, res) => {
    const {id} = req.params;

    const user = req.user as User;

    const myGroups = await prisma.user.findFirst({
        where: {id: user.id},
        include: {
            groups: {
                include: {
                    members: true,
                    messages: {include: {attachments: true, sender: {omit: {token: true, email: true, password: true}}}}
                }
            }
        }
    });

    if (myGroups && myGroups.groups) {
        const targetGroup = myGroups.groups.find(group => group.id === id);
        if (targetGroup) res.json({...targetGroup});
        else res.status(404).json({error: "Group not found"});

    } else res.status(404).json({error: "User not found"});
})

export default router;
