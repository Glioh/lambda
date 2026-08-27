import { clerkPlugin } from "@clerk/fastify";
import fp from "fastify-plugin";
import { ErrorResponseSchema, schemaRef } from "@lambda/api-contracts";
import { resolveClerkPrincipal } from "../auth/clerk-auth.js";
import type { PrincipalResolver } from "../auth/auth-principal.js";

export type AuthPluginOptions = {
	principalResolver?: PrincipalResolver;
};

export const authPlugin = fp<AuthPluginOptions>(
	async (app, options) => {
		if (!options.principalResolver) app.register(clerkPlugin);

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
		});
	},
	{
		name: "lambda-api-auth",
		fastify: "5.x",
	},
);
