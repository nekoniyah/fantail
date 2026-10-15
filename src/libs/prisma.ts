import {PrismaLibSql} from "@prisma/adapter-libsql";
import {PrismaClient} from "@prisma";

const prisma = new PrismaClient({
    adapter: new PrismaLibSql({url: process.env["DATABASE_URL"]!}),
});

export default prisma;
