import { prisma } from "../../db.js";
import { generateChatTitle } from "../../projects/title.js";
import { usageRepository } from "../../repositories/usage.repository.js";
import { usageService } from "../../services/usage.service.js";

const { chargeCredits, getUsageStatus } = usageService(
	usageRepository(prisma),
	() => process.env.NODE_ENV === "development" && process.env.DISABLE_USAGE_LIMITS === "true",
);

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
