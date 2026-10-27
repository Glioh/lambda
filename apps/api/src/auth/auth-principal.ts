import type { FastifyRequest } from "fastify";

/** Lambda-owned authenticated identity, independent of auth provider. */
export type AuthPrincipal = {
	userId: string;
	sessionId: string | null;
};

/** Durable Lambda boundary for resolving Lambda-owned, provider-independent identity. */
export type PrincipalResolver = (
	request: FastifyRequest,
) => AuthPrincipal | null | Promise<AuthPrincipal | null>;

/**
 * Transitional Clerk-era resolver for request-scoped plan entitlement.
 * Keeps provider-specific checks out of AuthPrincipal and application services.
 * Replace with Lambda-owned entitlement resolution once canonical users and
 * subscription state belong to the application.
 */
export type ProPlanResolver = (request: FastifyRequest) => boolean | Promise<boolean>;
