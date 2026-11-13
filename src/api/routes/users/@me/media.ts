import { Router } from "express";
import multer from "multer";
import prisma from "@lib/prisma.ts";
import auth from "@middlewares/auth.ts";
import type { User } from "@prisma";
import { sendError, sendData, sendMessage } from "@lib/responses";
import { cache } from "@lib/cache";

const router = Router();

// Library items are small and get rendered at small sizes
const LIBRARY_MAX_BYTES = 1024 * 1024; // 1 MB
const LIBRARY_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/apng",
] as const;

const LIBRARY_KINDS = ["emote", "sticker"] as const;
type LibraryKind = (typeof LIBRARY_KINDS)[number];

const isLibraryKind = (v: string): v is LibraryKind =>
  (LIBRARY_KINDS as readonly string[]).includes(v);

const myMulter = multer({
  limits: {
    fileSize: LIBRARY_MAX_BYTES,
    files: 1,
  },
});

/** Library listings never need the (potentially large) data column. */
const librarySelect = {
  id: true,
  type: true,
  format: true,
  name: true,
} as const;

router.get("/", auth, async (req, res) => {
  const user = (req as any).user as User;

  const media = await prisma.media.findMany({
    where: { uploaderId: user.id, type: { in: [...LIBRARY_KINDS] } },
    orderBy: { id: "desc" },
    select: librarySelect,
  });

  sendData(res, 200, media);
});

router.get("/:id", auth, async (req, res) => {
  const user = (req as any).user as User;

  const media = await prisma.media.findFirst({
    where: {
      id: req.params.id as string,
      uploaderId: user.id,
      type: { in: [...LIBRARY_KINDS] },
    },
    select: librarySelect,
  });

  if (!media) return sendError(res, 404, "Media not found");

  sendData(res, 200, media);
});

router.post(
  "/:kind",
  auth,
  (req, res, next) => {
    myMulter.single("file")(req, res, (err) => {
      if (!err) return next();
      const tooLarge = (err as { code?: string }).code === "LIMIT_FILE_SIZE";
      return sendError(
        res,
        tooLarge ? 413 : 400,
        tooLarge
          ? "File too large (1 MB max for emoji and stickers)"
          : "Invalid upload",
      );
    });
  },
  async (req, res) => {
    const user = (req as any).user as User;
    const kind = req.params.kind as string;

    if (!isLibraryKind(kind))
      return sendError(res, 400, "Kind must be emote or sticker");

    const file = req.file;
    if (!file) return sendError(res, 400, "No file uploaded");

    // The files router only serves whitelisted types inline, so a scriptable
    // SVG or unknown type must not be accepted into the library.
    if (
      !LIBRARY_TYPES.includes(file.mimetype as (typeof LIBRARY_TYPES)[number])
    )
      return sendError(res, 400, "Only PNG, JPEG, GIF and WebP are allowed");

    const data = file.buffer.toString("base64");

    // Content-addressed dedupe, scoped to this user and kind
    const existing = await prisma.media.findFirst({
      where: { uploaderId: user.id, type: kind, data },
      select: librarySelect,
    });
    if (existing) return sendError(res, 409, "You already uploaded this file");

    const name =
      typeof req.body?.name === "string"
        ? req.body.name.trim().slice(0, 32)
        : "";
    const fallback = file.originalname.replace(/\.[^.]+$/, "").slice(0, 32);

    const media = await prisma.media.create({
      data: {
        type: kind,
        format: file.mimetype.split("/")[1] as string,
        data,
        name: name || fallback,
        uploaderId: user.id,
      },
      select: librarySelect,
    });

    sendData(res, 201, media);
  },
);

router.delete("/:id", auth, async (req, res) => {
  const user = (req as any).user as User;

  const owned = await prisma.media.findFirst({
    where: {
      id: req.params.id as string,
      uploaderId: user.id,
      type: { in: [...LIBRARY_KINDS] },
    },
    select: { id: true },
  });

  if (!owned) return sendError(res, 404, "Media not found");

  await prisma.media.delete({ where: { id: owned.id } });
  cache.del(`media:${owned.id}`);

  // Hard delete (no orphan rows). Messages that referenced this item keep
  // their stored id; the files router answers 404 for it and the client
  // renders failed images as a broken-image fallback.
  sendMessage(res, 200, "Media deleted");
});

export default router;
