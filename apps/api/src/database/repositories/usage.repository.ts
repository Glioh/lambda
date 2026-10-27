import type { PrismaClient } from "@prisma/client";
import { RateLimiterPrisma } from "rate-limiter-flexible";

export function usageRepository(db: PrismaClient) {
	function tracker(points: number, duration: number) {
		return new RateLimiterPrisma({ storeClient: db, tableName: "Usage", points, duration });
	}

	return {
		async consume(userId: string, points: number, duration: number) {
			try {
				await tracker(points, duration).consume(userId, 1);
				return true;
			} catch (error) {
				if (error && typeof error === "object" && "msBeforeNext" in error) {
					return false;
				}
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
