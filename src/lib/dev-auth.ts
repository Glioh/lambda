import { auth } from "@clerk/nextjs/server";

/**
 * Dev-only escape hatches, all OFF unless explicitly enabled via env.
 * Intended for local testing — never enable in production.
 *
 * - DEV_NO_AUTH=true       → skip the login wall; unauthenticated requests act
 *                            as a fixed local user (also disables usage limits).
 * - DISABLE_USAGE_LIMITS=true → don't consume/enforce chat credits.
 */
export const DEV_NO_AUTH = process.env.DEV_NO_AUTH === "true";

export const DEV_FAKE_USER_ID = "dev-local-user";

export const USAGE_LIMITS_DISABLED =
	process.env.DISABLE_USAGE_LIMITS === "true" || DEV_NO_AUTH;

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
