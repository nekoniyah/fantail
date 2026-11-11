import { Router } from "express";

import multer from "multer";
import prisma from "@lib/prisma";
import auth from "@middlewares/auth";

const MAX_UPLOAD_SIZE = Number(process.env.MAX_UPLOAD_SIZE) * 1024 * 1024;

const myMulter = multer({
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
});

const router = Router();

router.get("/:id", async (req, res) => {
  const id = req.params.id;

  const media = await prisma.media.findUnique({
    where: {
      id,
    },
  });

  if (!media)
    return res.status(404).json({
      message: "Media not found",
    });

  // Only well-known image types are shown inline; everything else is a download.
  const inline = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ].includes(media.type);

  const buffer = Buffer.from(media.data, "base64");

  res.set("Cross-Origin-Resource-Policy", "cross-origin");

  if (inline) {
    res.set("Content-Type", `image/${media.format}`);
    res.send(buffer);
  } else {
    res.set(
      "Content-Disposition",
      `attachment; filename="${id}.${media.format}"`,
    );
    res.send(buffer);
  }
});

router.post("/", auth, myMulter.single("file"), async (req, res) => {
  if (req.file) {
    const data = req.file.buffer.toString("base64");

    // Check duplicate entries.

    const existingMedia = await prisma.media.findFirst({
      where: {
        data,
      },
    });

    if (existingMedia)
      return res.status(400).json({
        media: existingMedia,
        message: "Duplicate file",
      });

    const media = await prisma.media.create({
      data: {
        data,
        format: req.file.originalname.split(".").pop() || "any",
        type: req.file.mimetype,
      },
    });

    res.status(201).json({
      media,
      path: `/api/files/${media.id}`,
    });

    return;
  }

  res.status(400).json({
    message: "No file uploaded",
  });
});

export default router;
