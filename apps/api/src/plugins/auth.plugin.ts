import type { AuthPrincipal, PrincipalResolver, ProPlanResolver } from "../auth/auth-principal.js";
import type { FastifyRequest } from "fastify";
import { clerkPlugin } from "@clerk/fastify";
import fp from "fastify-plugin";
import { resolveClerkPrincipal, resolveClerkProPlan } from "../auth/clerk.js";
import { ErrorResponseSchema, schemaRef } from "../contracts/index.js";

export type AuthPluginOptions = {
	principalResolver?: PrincipalResolver;
	proPlanResolver?: ProPlanResolver;
};

export const authPlugin = fp<AuthPluginOptions>(
	async (app, options) => {
		if (options.principalResolver && !options.proPlanResolver) {
			throw new Error("Custom principal resolver requires proPlanResolver.");
		}
		if (!options.principalResolver) {
			app.register(clerkPlugin);
		}
		const resolveProPlan = options.proPlanResolver ?? resolveClerkProPlan;

		// Add default 401 response schema to all routes
		app.addHook("onRoute", route => {
			route.schema ??= {};
			route.schema.response = {
				401: schemaRef(ErrorResponseSchema),
				...(route.schema.response ?? {}),
			};
		});

		// Require an authenticated principal for all protected routes.
		app.addHook("preHandler", async (request, reply) => {
			const principal = await (options.principalResolver ?? resolveClerkPrincipal)(request);
			if (!principal) {
				return reply.code(401).send({
					statusCode: 401,
					error: "Unauthorized",
					message: "Not authenticated.",
				});
			}
			request.authPrincipal = principal;
			// Transitional Clerk-era request decoration; replace with Lambda-owned entitlement state.
			request.isPro = await resolveProPlan(request);
		});
	},
	{
		name: "lambda-api-auth",
		fastify: "5.x",
	},
);

declare module "fastify" {
	interface FastifyRequest {
		authPrincipal?: AuthPrincipal;
		isPro?: boolean;
	}
}

export function getAuthPrincipal(request: FastifyRequest): AuthPrincipal {
	if (!request.authPrincipal) {
		throw new Error("Authenticated principal missing after auth hook.");
	}
	return request.authPrincipal;
}

export function getProPlan(request: FastifyRequest): boolean {
	if (request.isPro === undefined) {
		throw new Error("Pro plan entitlement was not resolved.");
	}
	return request.isPro;
}
