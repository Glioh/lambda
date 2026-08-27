import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { clerkPlugin } from "@clerk/fastify";
import fastifySwagger from "@fastify/swagger";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyRequest } from "fastify";
import { ErrorResponseSchema, schemaRef } from "@lambda/api-contracts";
import type { AuthPrincipal } from "./auth/auth-principal.js";
import { resolveClerkPrincipal } from "./auth/clerk-auth.js";
import { defaultRouteDependencies, registerRoutes, type ApiRouteDependencies, } from "./http/routes/index.js";
import { schemasPlugin } from "./http/plugins/schemas.plugin.js";

const healthResponseSchema = {
	type: "object",
	additionalProperties: false,
	required: ["status"],
	properties: {
		status: { type: "string", enum: ["ok"] },
	},
} as const;

/** Builds API application without binding a network port. */
type BuildAppOptions = Pick<FastifyServerOptions, "logger"> & {
	principalResolver?: (
		request: FastifyRequest,
	) => AuthPrincipal | null | Promise<AuthPrincipal | null>;
	routeDependencies?: ApiRouteDependencies;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
	if (
		!options.principalResolver &&
		(!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY)
	) {
		throw new Error("Clerk configuration requires CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.");
	}
	const routeDependencies = options.routeDependencies ?? defaultRouteDependencies;
	const app = Fastify({
		logger: options.logger ?? { level: process.env.LOG_LEVEL ?? "info" },
		ajv: {
			customOptions: {
				coerceTypes: false,
			},
		},
	}).withTypeProvider<TypeBoxTypeProvider>();

	app.register(schemasPlugin);
	app.register(fastifySwagger, {
		openapi: {
			openapi: "3.1.0",
			info: { title: "Lambda API", version: "0.1.0" },
		},
		refResolver: {
			buildLocalReference: (json, _baseUri, _fragment, i) =>
				typeof json.$id === "string" ? json.$id : `def-${i}`,
		},
	});
	app.get(
		"/api/health",
		{
			schema: {
				hide: true,
				response: {
					200: healthResponseSchema,
				},
			},
		},
		async () => ({ status: "ok" as const }),
	);

	app.register(async protectedApp => {
		const api = protectedApp.withTypeProvider<TypeBoxTypeProvider>();
		if (!options.principalResolver) api.register(clerkPlugin);
		api.addHook("onRoute", route => {
			route.schema ??= {};
			route.schema.response = {
				401: schemaRef(ErrorResponseSchema),
				...(route.schema.response ?? {}),
			};
		});
		api.addHook("preHandler", async (request, reply) => {
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

		registerRoutes(api, routeDependencies);
	});

	app.get("/api/openapi.json", { schema: { hide: true } }, async () => app.swagger());

	// Fastify default 500 error response shows actual internal error message
	// We override it to avoid leaking internal error details to clients.
	app.setErrorHandler((error, request, reply) => {
		const statusCode =
			typeof error === "object" &&
			error !== null &&
			"statusCode" in error &&
			typeof error.statusCode === "number"
				? error.statusCode
				: 500;
		if (statusCode < 500) return reply.code(statusCode).send(error);

		request.log.error({ err: error }, "Unhandled API error");
		return reply.code(500).send({
			statusCode: 500,
			error: "Internal Server Error",
			message: "Internal Server Error",
		});
	});

	return app;
}
