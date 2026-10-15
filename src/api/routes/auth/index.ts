import {Router} from "express";
import prisma from "@lib/prisma";
import {compareSync, hashSync} from "bcrypt";
import token from "@lib/token";
import {z} from "zod";
import passport from "passport";

const router = Router();

const passwordSalt = Number(process.env.PASSWORD_SALT);

const loginSchema = z.object({
    emailOrUsername: z.string().min(1),
    password: z.string(),
});

const registerSchema = z.object({
    email: z.nullable(z.email().optional()),
    username: z.string({error: "Username must be between 4 and 20 characters"}).min(4).max(20),
    password: z.string({error: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character"}).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/),
});

router.post("/login", async (req, res) => {
    if (!req.body) {
        res.status(400).json({
            message: "Request body is empty",
        });
        return;
    }

    const {data, success, error} = await loginSchema.safeParseAsync(req.body);

    if (!success) return res.status(400).json({
        message: error.message
    });

    const {emailOrUsername, password} = data;

    const account = await prisma.user.findFirst({
        where: {
            OR: [{username: emailOrUsername}, {email: emailOrUsername},],
        },
    });

    if (!account) return res.status(404).json({
        message: "Account with email or username does not exist",
    });

    if (!compareSync(password, account.password)) return res.status(401).json({
        message: "Invalid password",
    });


    res.status(200).json({
        message: "Login successful", token: account.token,
    });

});

router.post("/register", async (req, res) => {
    if (!req.body) return res.status(400).json({
        message: "Request body is empty",
    });


    const {data, success, error} = registerSchema.safeParse(req.body);

    if (!success) return res.status(400).json({
        message: (error.issues[0] as any).message
    });

    const {email, password, username} = data;

    let account = await prisma.user.findFirst({where: {username}});

    if (!account && email) account = await prisma.user.findFirst({where: {email}});

    if (account) return res.status(404).json({
        message: "Account with email or username already exists",
    });

    const hashedPassword = hashSync(password, passwordSalt);

    account = await prisma.user.create({
        data: {
            username, password: hashedPassword, token: token(), email: email ? email : undefined,
        },
    });

    res.locals.user = account;

    res.cookie("token", account.token, {
        httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 3,
    });

    res.status(200).json({
        account, message: "Successfully created account.",
    });
});

export default router;
