import {Router} from "express";
import auth from "@middlewares/auth.ts";
import type {User} from "@prisma";
import prisma from "@lib/prisma.ts";

const router = Router();


router.get("/sent", auth, async (req, res)=>{
    const user = req.user as User;

    const invitations = await prisma.friendInvitation.findMany({
        where: {
            senderId: user.id
        }
    })

    res.json(invitations)
})

router.get("/", auth, async (req, res) => {
    const user = req.user as User;

    const invitations = await prisma.friendInvitation.findMany({
        where: {
            targetId: user.id
        }
    })

    res.json(invitations)
})

router.post("/", auth, async (req, res) => {
    const user = req.user as User;

    const targetId = req.body.targetId as string;

    if (user.id === targetId) return res.status(400).json({error: "You cannot send a friend request to yourself"})

    const targetUser = await prisma.user.findUnique({
        where: {
            id: targetId
        }
    })

    if (!targetUser) return res.status(404).json({error: "User not found"})

    const existingInvitation = await prisma.friendInvitation.findFirst({
        where: {
            targetId,
            senderId: user.id
        }
    })

    if (existingInvitation) return res.status(400).json({error: "You already sent a friend request to this user"})

    await prisma.friendInvitation.create({
        data: {
            senderId: user.id,
            targetId
        }
    })

    res.status(200).json({
        message: "Friend request sent"
    })
})

// Cancel or deny a friend request

router.delete("/:id", auth, async (req, res) => {
    const user = req.user as User;
    const id = req.params.id as string;

    const myInvitation = await prisma.friendInvitation.findUnique({
        where: {
            id
        }
    })

    if (!myInvitation) return res.status(404).json({error: "Invitation not found"})

    if (myInvitation.targetId !== user.id || myInvitation.senderId !== user.id) return res.status(403).json({error: "You are not the target or sender of this invitation"})

    await prisma.friendInvitation.delete({
        where: {
            id
        }
    })

    res.status(200).json({
        message: "Invitation deleted"
    })
})

// Accept an friend request

router.post("/:id", auth, async (req, res) => {
    const user = req.user as User;
    const id = req.params.id as string;
    const invitation = await prisma.friendInvitation.findUnique({where: {id}})

    if (!invitation) return res.status(404).json({error: "Invitation not found"});

    if (invitation.targetId !== user.id) return res.status(403).json({error: "You are not the target of this invitation"})

    // Delete the invitation and add friend to friend list

    await prisma.friendInvitation.delete({where: {id}})
    await prisma.user.update({
        where: {id: user.id},
        data: {
            friends: {
                connect: {
                    id: invitation.senderId
                }
            }
        }
    })
})


export default router;