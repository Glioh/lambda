import { PrismaClient } from "@/generated/prisma/client";
//this sets up the prisma client
//since nextjs hot reloads we need to make sure we only have one instance of the prisma client
//^^ tf why does intellesense complete my sentences now
const globalForPrisma = global as unknown as { prisma: PrismaClient}

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

