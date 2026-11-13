import { Router } from "express";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth";
import type { User } from "@prisma";
import { sendError, sendData } from "@lib/responses";

const router = Router();

router.get("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
    },
  });

  sendData(res, 200, notifications);
});

router.post("/:id/read", auth, async (req, res) => {
  const user = (req as any).user as User;
  const notificationId = req.params.id as string;

  const notification = await prisma.notification.findUnique({
    where: {
      id: notificationId,
    },
  });

  if (!notification) {
    return sendError(res, 404, "Notification not found");
  }

  if (notification.userId !== user.id) {
    return sendError(
      res,
      403,
      "You are not authorized to mark this notification as read",
    );
  }

  const updatedNotification = await prisma.notification.update({
    where: {
      id: notificationId,
    },
    data: {
      read: true,
    },
  });

  sendData(res, 200, updatedNotification);
});

export default router;
