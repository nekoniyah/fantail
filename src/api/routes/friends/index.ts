import {Router} from "express";
import auth from "@middlewares/auth.ts";
import type {User} from "@prisma";
import prisma from "@lib/prisma.ts";

const router = Router();


// Remove friend from friend list

router.get("/", auth, async (req, res) => {
    const user = req.user as User;

    const userWithFriends = await prisma.user.findFirst({
        where: {id: user.id},
        include: {friends: {omit: {token: true, email: true, password: true}}}
    });

    if (!userWithFriends)
        return res.status(404).json({error: "User not found"});

    return res.status(200).json(userWithFriends.friends);
})

router.delete("/:id", auth, async (req, res) => {
    const user = req.user as User;
    const friendId = req.params.id as string;

    const userWithFriends = await prisma.user.findFirst({
        where: {id: user.id},
        include: {friends: {omit: {token: true, email: true, password: true}}}
    });

    if (!userWithFriends)
        return res.status(404).json({error: "User not found"});

    const friend = userWithFriends.friends.find(friend => friend.id === friendId);

    if (!friend) return res.status(404).json({error: "Friend not found"});

    await prisma.user.update({
        where: {id: user.id},
        data: {
            friends: {
                disconnect: {id: friendId}
            }
        }
    })

    return res.status(200).json({message: "Friend removed"});
})


export default router;