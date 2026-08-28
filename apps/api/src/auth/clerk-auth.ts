import type { AuthPrincipal, PrincipalResolver } from "./auth-principal.js";
import type { FastifyRequest } from "fastify";
import { getAuth } from "@clerk/fastify";

declare module "fastify" {
	interface FastifyRequest {
		authPrincipal?: AuthPrincipal;
	}
}

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

export function getAuthPrincipal(request: FastifyRequest): AuthPrincipal {
	if (!request.authPrincipal) {
		throw new Error("Authenticated principal missing after auth hook.");
	}
	return request.authPrincipal;
}
