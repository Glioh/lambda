import type { PrincipalResolver, ProPlanResolver } from "./auth-principal.js";
import { getAuth } from "@clerk/fastify";

export function assertClerkConfigured(): void {
	if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
		throw new Error("Clerk configuration requires CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.");
	}
}

/** Adapts Clerk's request auth to Lambda's principal. */
export const resolveClerkPrincipal: PrincipalResolver = request => {
	const auth = getAuth(request);
	if (!auth.isAuthenticated || !auth.userId) {
		return null;
	}

	return { userId: auth.userId, sessionId: auth.sessionId ?? null };
};

/** Transitional Clerk adapter for request-scoped plan entitlement. */
export const resolveClerkProPlan: ProPlanResolver = request =>
	getAuth(request).has?.({ plan: "pro" }) ?? false;
