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

// ── Encrypted attachments ──
// Max plaintext size. Keep in sync with MAX_ATTACHMENT_BYTES in #lib/crypto.ts,
// and fall back to 10 MB if MAX_UPLOAD_SIZE isn't set (NaN would disable the check).
const ATTACHMENT_MAX_BYTES = Number.isFinite(MAX_UPLOAD_SIZE)
  ? MAX_UPLOAD_SIZE
  : 10 * 1024 * 1024;
const SECRETBOX_MAC_BYTES = 16; // ciphertext = plaintext + 16
const NONCE_B64_LEN = 32; // 24 bytes
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const isBase64 = (v: unknown): v is string =>
  typeof v === "string" && v.length % 4 === 0 && BASE64.test(v);

// Separate instance: the ciphertext is 16 bytes bigger than the plaintext cap
const attachmentMulter = multer({
  limits: {
    fileSize: ATTACHMENT_MAX_BYTES + SECRETBOX_MAC_BYTES,
    files: 1,
  },
});
const uploadOneAttachment = attachmentMulter.single("file");

const INLINE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

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

  const buffer = Buffer.from(media.data, "base64");

  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.set("X-Content-Type-Options", "nosniff");

  // Encrypted attachment: opaque ciphertext. Safe to serve without auth, since
  // only group members hold the key. The ID is unguessable and immutable.
  if (media.type === "attachment") {
    res.set("Content-Type", "application/octet-stream");
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    return res.send(buffer);
  }

  // Only well-known image types are shown inline; everything else is a download.
  if (INLINE_TYPES.includes(media.type)) {
    // Use the whitelisted type itself, never the user-supplied extension
    // (an "image/png" upload named "x.svg+xml" used to be served as SVG).
    res.set("Content-Type", media.type);
    res.send(buffer);
  } else {
    res.set(
      "Content-Disposition",
      `attachment; filename="${id}.${media.format}"`,
    );
    res.send(buffer);
  }
});

// Plaintext upload: emotes, stickers and other shared library items.
router.post("/", auth, myMulter.single("file"), async (req, res) => {
  if (req.file) {
    // "attachment" is reserved for encrypted uploads (see /attachments)
    if (req.file.mimetype === "attachment")
      return res.status(400).json({
        message: "Invalid file type",
      });

    const data = req.file.buffer.toString("base64");

    // Check duplicate entries.

    const existingMedia = await prisma.media.findFirst({
      where: {
        data,
        type: { not: "attachment" },
      },
    });

    if (existingMedia)
      return res.status(400).json({
        media: existingMedia,
        message: "Duplicate file",
      });

    const extension = (req.file.originalname.split(".").pop() || "")
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 10);

    const media = await prisma.media.create({
      data: {
        data,
        format: extension || "any",
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

// Encrypted upload for group messages, as multipart: `file` = raw ciphertext,
// `nonce` = base64. The server never sees the key, the filename or the MIME type.
// Multipart sidesteps any JSON body limit (e.g. a global express.json()).
router.post(
  "/attachments",
  auth,
  (req, res, next) => {
    uploadOneAttachment(req, res, (err) => {
      if (!err) return next();
      const tooLarge = (err as { code?: string }).code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({
        message: tooLarge ? "File too large" : "Invalid upload",
      });
    });
  },
  async (req, res) => {
    // Adjust if your auth middleware stores the user somewhere else
    const userId: string | undefined = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const nonce = req.body?.nonce;

    if (
      !req.file ||
      req.file.size < SECRETBOX_MAC_BYTES ||
      !isBase64(nonce) ||
      nonce.length !== NONCE_B64_LEN
    ) {
      return res.status(400).json({ message: "Invalid attachment" });
    }

    // No duplicate check: each file gets a fresh key and nonce, so ciphertexts never repeat.
    const media = await prisma.media.create({
      data: {
        type: "attachment",
        format: "bin",
        data: req.file.buffer.toString("base64"),
        nonce,
        uploaderId: userId,
      },
      select: { id: true }, // don't echo megabytes back
    });

    res.status(201).json({
      media,
      path: `/api/files/${media.id}`,
    });
  },
);

export default router;
