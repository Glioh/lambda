import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { assertClerkConfigured } from "./auth/clerk-auth.js";
import type { PrincipalResolver } from "./auth/auth-principal.js";
import { defaultRouteDependencies, type ApiRouteDependencies } from "./http/routes/dependencies.js";
import { protectedApiPlugin } from "./http/protected-api.plugin.js";
import { publicApiPlugin } from "./http/public-api.plugin.js";
import { errorHandlerPlugin } from "./plugins/error-handler.plugin.js";
import { openApiPlugin } from "./plugins/openapi.plugin.js";
import { schemasPlugin } from "./plugins/schemas.plugin.js";

/** Builds API application without binding a network port. */
type BuildAppOptions = Pick<FastifyServerOptions, "logger"> & {
	principalResolver?: PrincipalResolver;
	routeDependencies?: ApiRouteDependencies;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
	if (!options.principalResolver) assertClerkConfigured();

	const app = Fastify({
		logger: options.logger ?? { level: process.env.LOG_LEVEL ?? "info" },
		ajv: {
			customOptions: {
				coerceTypes: false,
			},
		},
	}).withTypeProvider<TypeBoxTypeProvider>();

	// Register core plugins (schemas, OpenAPI, error handling)
	app.register(schemasPlugin);
	app.register(openApiPlugin);
	app.register(errorHandlerPlugin);

	// Register public API routes first
	app.register(publicApiPlugin);

	// Register protected API routes next
	app.register(protectedApiPlugin, {
		principalResolver: options.principalResolver,
		dependencies: options.routeDependencies ?? defaultRouteDependencies,
	});

	return app;
}
