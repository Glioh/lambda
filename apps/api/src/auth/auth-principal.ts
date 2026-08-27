import type { FastifyRequest } from "fastify";

/** Lambda-owned authenticated request identity. */
export type AuthPrincipal = {
	userId: string;
	sessionId: string | null;
};

export type PrincipalResolver = (
	request: FastifyRequest,
) => AuthPrincipal | null | Promise<AuthPrincipal | null>;
