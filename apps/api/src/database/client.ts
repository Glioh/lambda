import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
	prisma?: PrismaClient;
};

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}
