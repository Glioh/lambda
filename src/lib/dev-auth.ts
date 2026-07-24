import { auth } from "@clerk/nextjs/server";

/**
 * Dev-only escape hatches, all OFF unless explicitly enabled via env.
 * These FAIL CLOSED: they activate only when NODE_ENV is exactly "development".
 * Staging, preview, test, and unset/mistyped NODE_ENV all leave them disabled —
 * absence of "production" is never treated as permission to bypass auth.
 *
 * - DEV_NO_AUTH=true       → skip the login wall; unauthenticated requests act
 *                            as a fixed local user (also disables usage limits).
 * - DISABLE_USAGE_LIMITS=true → don't consume/enforce chat credits.
 */
const nodeEnv = process.env.NODE_ENV;
const isDevelopment = nodeEnv === "development";
const isProduction = nodeEnv === "production";
const devNoAuthRequested = process.env.DEV_NO_AUTH === "true";
const disableUsageLimitsRequested =
	process.env.DISABLE_USAGE_LIMITS === "true";
const anyBypassRequested = devNoAuthRequested || disableUsageLimitsRequested;

// Fail fast: these bypasses must never be reachable in a production build,
// even by misconfiguration. Refuse to boot rather than silently allowing them.
if (isProduction && anyBypassRequested) {
	throw new Error(
		"DEV_NO_AUTH / DISABLE_USAGE_LIMITS are not allowed when NODE_ENV=production.",
	);
}

// Any other non-development environment (staging, preview, test, unset) ignores
// the flags rather than honoring them. Warn so the misconfiguration is visible.
if (anyBypassRequested && !isDevelopment) {
	console.warn(
		`[dev-auth] Ignoring DEV_NO_AUTH/DISABLE_USAGE_LIMITS: NODE_ENV is "${nodeEnv ?? "unset"}", not "development".`,
	);
}

export const DEV_NO_AUTH = isDevelopment && devNoAuthRequested;

export const DEV_FAKE_USER_ID = "dev-local-user";

export const USAGE_LIMITS_DISABLED =
	isDevelopment && (disableUsageLimitsRequested || devNoAuthRequested);

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
