import { getAuth } from "@clerk/fastify";
import type { FastifyRequest } from "fastify";
import type { AuthPrincipal } from "./auth-principal.js";

declare module "fastify" {
	interface FastifyRequest {
		authPrincipal?: AuthPrincipal;
	}
}

/** Adapts Clerk's request auth to Lambda's principal. */
export function resolveClerkPrincipal(request: FastifyRequest): AuthPrincipal | null {
	const auth = getAuth(request);
	if (!auth.isAuthenticated || !auth.userId) {
		return null;
	}

	return { userId: auth.userId, sessionId: auth.sessionId ?? null };
}

export function getAuthPrincipal(request: FastifyRequest): AuthPrincipal {
	if (!request.authPrincipal) {
		throw new Error("Authenticated principal missing after auth hook.");
	}
	return request.authPrincipal;
}
