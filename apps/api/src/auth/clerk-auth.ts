import { getAuth } from "@clerk/fastify";
import type { FastifyRequest } from "fastify";
import type { AuthPrincipal } from "./auth-principal.js";

/** Adapts Clerk's request auth to Lambda's principal. */
export function resolveClerkPrincipal(request: FastifyRequest): AuthPrincipal | null {
	const auth = getAuth(request);
	return auth.isAuthenticated ? { userId: auth.userId, sessionId: auth.sessionId ?? null } : null;
}
