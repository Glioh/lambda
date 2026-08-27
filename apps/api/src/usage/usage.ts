import { getAuth } from "@clerk/fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "../db.js";

const FREE_POINTS = 10;
const PRO_POINTS = 100;
const DURATION = 30 * 24 * 60 * 60;

function usageTracker(request: FastifyRequest) {
	const clerkAuth = getAuth(request) as {
		has?: (plan: { plan: string }) => boolean;
	};
	return new RateLimiterPrisma({
		storeClient: prisma,
		tableName: "Usage",
		points: clerkAuth.has?.({ plan: "pro" }) ? PRO_POINTS : FREE_POINTS,
		duration: DURATION,
	});
}

export async function consumeCredits(request: FastifyRequest, userId: string) {
	if (process.env.NODE_ENV === "development" && process.env.DISABLE_USAGE_LIMITS === "true") {
		return null;
	}
	return usageTracker(request).consume(userId, 1);
}

export function getUsageStatus(request: FastifyRequest, userId: string) {
	return usageTracker(request).get(userId);
}

// Temporary transport adapter; #69 moves this boundary into UsageService.
export async function chargeCredits(request: FastifyRequest, userId: string, reply: FastifyReply) {
	try {
		await consumeCredits(request, userId);
		return true;
	} catch (error) {
		if (error && typeof error === "object" && "msBeforeNext" in error) {
			reply.code(429).send({
				statusCode: 429,
				code: "USAGE_LIMIT_EXCEEDED",
				error: "Too Many Requests",
				message: "Usage limit exceeded.",
			});
			return false;
		}
		request.log.error({ err: error }, "Usage check failed");
		reply.code(500).send({
			statusCode: 500,
			error: "Internal Server Error",
			message: "Internal Server Error",
		});
		return false;
	}
}
