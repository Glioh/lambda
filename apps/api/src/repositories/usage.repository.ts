import type { PrismaClient } from "@prisma/client";
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { ApplicationError } from "../application-error.js";

export function usageRepository(prisma: PrismaClient) {
	function tracker(points: number, duration: number) {
		return new RateLimiterPrisma({ storeClient: prisma, tableName: "Usage", points, duration });
	}
	return {
		async consume(userId: string, points: number, duration: number) {
			try {
				await tracker(points, duration).consume(userId, 1);
			} catch (error) {
				if (error && typeof error === "object" && "msBeforeNext" in error)
					throw new ApplicationError("USAGE_LIMIT_EXCEEDED", "Usage limit exceeded.");
				throw error;
			}
		},
		async get(userId: string, points: number, duration: number) {
			const status = await tracker(points, duration).get(userId);
			return status
				? { remainingPoints: status.remainingPoints, msBeforeNext: status.msBeforeNext }
				: null;
		},
	};
}
