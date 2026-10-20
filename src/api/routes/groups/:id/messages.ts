import {Router} from 'express';
import auth from "@middlewares/auth.ts";
import type {User} from "@prisma";
import {fetchGroup} from "../index.ts";
import prisma from "@lib/prisma.ts";

const router = Router({mergeParams: true});

router.get("/", auth, async (req, res) => {
    const group = await fetchGroup(req.params.id as string, req.user as User, res);

    if (!group) return;

    const messages = await prisma.groupMessage.findMany({
        where: {groupId: group.id}, include: {
            sender: {
                omit: {password: true, token: true, email: true}
            }
        }
    })

    res.json(messages);
})

router.post("/", auth, async (req, res) => {

})

export default router;