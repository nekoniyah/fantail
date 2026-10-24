import { Router } from "express";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth";
import type { User } from "@prisma";

const router = Router();

router.get("/", auth, async (req, res) => {
  const user = req.user as User;

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
    },
  });

  res.json(notifications);
});

router.post("/:id/read", auth, async (req, res) => {
  const user = req.user as User;
  const notificationId = req.params.id as string;

  const notification = await prisma.notification.findUnique({
    where: {
      id: notificationId,
    },
  });

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  if (notification.userId !== user.id) {
    return res.status(403).json({
      error: "You are not authorized to mark this notification as read",
    });
  }

  const updatedNotification = await prisma.notification.update({
    where: {
      id: notificationId,
    },
    data: {
      read: true,
    },
  });

  res.json(updatedNotification);
});

export default router;
