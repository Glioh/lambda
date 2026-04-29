import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "./db";
import { auth } from "@clerk/nextjs/server";

const FREE_POINTS = 10;
const PRO_POINTS = 100;
const DURATION = 30 * 24 * 60 * 60; // 30 days in seconds
const GENERATION_COST = 1;

const logLatency = (
	traceId: string | undefined,
	step: string,
	startTime: number,
	details?: Record<string, unknown>,
) => {
	console.log("[chat-latency]", {
		traceId: traceId ?? "unknown",
		step,
		elapsedMs: Date.now() - startTime,
		...details,
	});
};

export async function getUsageTracker() {
	const { has } = await auth();
	const hasProAccess = has?.({ plan: "pro" });

	const usageTracker = new RateLimiterPrisma({
		storeClient: prisma,
		tableName: "Usage",
		points: hasProAccess ? PRO_POINTS : FREE_POINTS,
		duration: DURATION,
	});

	return usageTracker;
}

export async function consumeCredits(debugTraceId?: string) {
	const startTime = Date.now();
	logLatency(debugTraceId, "usage.consume.start", startTime);

	const { userId } = await auth();
	if (!userId) {
		throw new Error("User not authenticated");
	}

	logLatency(debugTraceId, "usage.consume.auth.end", startTime, { userId });

	const usageTracker = await getUsageTracker();
	logLatency(debugTraceId, "usage.consume.tracker.end", startTime);

	const result = await usageTracker.consume(userId, GENERATION_COST);
	logLatency(debugTraceId, "usage.consume.complete", startTime, {
		remainingPoints: result.remainingPoints,
		msBeforeNext: result.msBeforeNext,
	});
	return result;
}

export async function getUsageStatus() {
	const { userId } = await auth();
	if (!userId) {
		throw new Error("User not authenticated");
	}

	const usageTracker = await getUsageTracker();
	const result = await usageTracker.get(userId);
	return result;
}
