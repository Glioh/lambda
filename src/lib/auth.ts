import { auth } from "@clerk/nextjs/server";

/**
 * Dev-only auth bypass. When DEV_AUTH_BYPASS=1 (and not in production), requests
 * without a Clerk session are treated as a fixed local dev user. This lets the app
 * be driven end-to-end locally without completing the hosted Clerk sign-in flow
 * (which is gated behind a Cloudflare Turnstile challenge that is hard to automate).
 *
 * In production, or when the flag is unset, this is a transparent pass-through to
 * Clerk's auth() — behavior is identical to calling auth() directly.
 */
const BYPASS_ENABLED =
	process.env.DEV_AUTH_BYPASS === "1" &&
	process.env.NODE_ENV !== "production";

export const DEV_USER_ID = "dev_user_local";

type ClerkAuth = Awaited<ReturnType<typeof auth>>;

export async function getAuth(): Promise<ClerkAuth> {
	const real = await auth();
	if (BYPASS_ENABLED && !real.userId) {
		return {
			...real,
			userId: DEV_USER_ID,
			has: ((real.has as unknown) ?? (() => false)),
		} as ClerkAuth;
	}
	return real;
}
