import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "./db";
import { auth } from "@clerk/nextjs/server";
import { USAGE_LIMITS_DISABLED, resolveUserId } from "./dev-auth";

const FREE_POINTS = 10;
const PRO_POINTS = 100;
const DURATION = 30 * 24 * 60 * 60; // 30 days in seconds
const GENERATION_COST = 1;

/** Creates rate limiter configured for current user's subscription tier. */
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

/** Consumes one generation credit for authenticated user. */
export async function consumeCredits() {
	// Always authenticate first — disabling metering must not also disable auth.
	const userId = await resolveUserId();
	if (!userId) {
		throw new Error("User not authenticated");
	}

	// Dev escape hatch: skip only the credit metering when limits are disabled.
	if (USAGE_LIMITS_DISABLED) {
		return null;
	}

	const usageTracker = await getUsageTracker();
	const result = await usageTracker.consume(userId, GENERATION_COST);
	return result;
}

/** Returns current credit usage for authenticated user. */
export async function getUsageStatus() {
	const userId = await resolveUserId();
	if (!userId) {
		throw new Error("User not authenticated");
	}

	const usageTracker = await getUsageTracker();
	const result = await usageTracker.get(userId);
	return result;
}
