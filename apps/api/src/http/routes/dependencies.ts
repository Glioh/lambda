import { prisma } from "../../db.js";
import { generateChatTitle } from "../../projects/title.js";
import { chargeCredits, getUsageStatus } from "../../usage/usage.js";

export type ApiRouteDependencies = {
	prisma: typeof prisma;
	chargeCredits: typeof chargeCredits;
	getUsageStatus: typeof getUsageStatus;
	generateChatTitle: typeof generateChatTitle;
};

export const defaultRouteDependencies: ApiRouteDependencies = {
	prisma,
	chargeCredits,
	getUsageStatus,
	generateChatTitle,
};
