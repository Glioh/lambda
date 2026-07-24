import { auth } from "@clerk/nextjs/server";

/**
 * Dev-only escape hatches, all OFF unless explicitly enabled via env.
 * Intended for local testing — never enable in production.
 *
 * - DEV_NO_AUTH=true       → skip the login wall; unauthenticated requests act
 *                            as a fixed local user (also disables usage limits).
 * - DISABLE_USAGE_LIMITS=true → don't consume/enforce chat credits.
 */
const isProduction = process.env.NODE_ENV === "production";
const devNoAuthRequested = process.env.DEV_NO_AUTH === "true";
const disableUsageLimitsRequested =
	process.env.DISABLE_USAGE_LIMITS === "true";

// Fail fast: these bypasses must never be reachable in a production deploy,
// even by misconfiguration. Refuse to boot rather than silently allowing them.
if (isProduction && (devNoAuthRequested || disableUsageLimitsRequested)) {
	throw new Error(
		"DEV_NO_AUTH / DISABLE_USAGE_LIMITS are not allowed when NODE_ENV=production.",
	);
}

export const DEV_NO_AUTH = !isProduction && devNoAuthRequested;

export const DEV_FAKE_USER_ID = "dev-local-user";

export const USAGE_LIMITS_DISABLED =
	!isProduction && (disableUsageLimitsRequested || devNoAuthRequested);

/**
 * Returns the current Clerk user id, or the fake local user id when DEV_NO_AUTH
 * is on and nobody is signed in. Returns null when auth is required and absent.
 */
export async function resolveUserId(): Promise<string | null> {
	const { userId } = await auth();
	if (userId) {
		return userId;
	}
	return DEV_NO_AUTH ? DEV_FAKE_USER_ID : null;
}
