import {Router} from "express";

import multer from "multer";
import prisma from "@lib/prisma";

const MAX_UPLOAD_SIZE = Number(process.env.MAX_UPLOAD_SIZE) * 1024 * 1024

const myMulter = multer({
    limits: {
        fileSize: MAX_UPLOAD_SIZE
    }
})

const router = Router();
router.use(async (req, res, next)=>{
    if(!req.user) return res.status(401).json({error: "Unauthorized"})
    next()
})

router.get("/:id", async (req, res) => {
    const id = req.params.id

    const media = await prisma.media.findUnique({
        where: {
            id
        }
    })

    if (!media) return res.status(404).json({
        message: "Media not found"
    })

    // Only well-known image types are shown inline; everything else is a download.
    const inline = ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(media.type);

    const buffer = Buffer.from(media.data, "base64")

    res.set("Cross-Origin-Resource-Policy", "cross-origin")

    res.setHeader("Content-Type", inline ? `image/${media.format}` : "application/octet-stream");
    res.setHeader("Content-Disposition", inline ? "inline" : "attachment");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

    res.send(buffer)
})

router.post("/", (req, res, next) => {
    myMulter.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({message: `File must be ${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)} MB or smaller`});
        }
        if (err) return next(err);
        next();
    });
}, async (req, res) => {
    if (req.file) {
        const data = req.file.buffer.toString("base64")

        // Check duplicate entries.

        const existingMedia = await prisma.media.findFirst({
            where: {
                data
            }
        })

        if (existingMedia) return res.status(400).json({
            media: existingMedia,
            message: "Duplicate file"
        })

        const media = await prisma.media.create({
            data: {
                data,
                format: "any",
                type: req.file.mimetype
            }
        })

        res.status(201).json({
            media,
            path: `/api/files/${media.id}`
        })

        return;
    }

    res.status(400).json({
        message: "No file uploaded"
    })
})

export default router;