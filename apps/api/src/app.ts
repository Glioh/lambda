import type { PrincipalResolver, ProPlanResolver } from "./auth/auth-principal.js";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify from "fastify";
import { assertClerkConfigured } from "./auth/clerk.js";
import { database } from "./database/database.js";
import { generateChatTitle } from "./integrations/title-generator.js";
import { errorHandlerPlugin } from "./plugins/error-handler.plugin.js";
import { openApiPlugin } from "./plugins/openapi.plugin.js";
import { protectedApiPlugin } from "./plugins/protected-api.plugin.js";
import { publicApiPlugin } from "./plugins/public-api.plugin.js";
import { schemasPlugin } from "./plugins/schemas.plugin.js";
import { messageService } from "./services/message.service.js";
import { projectService } from "./services/project.service.js";
import { usageService } from "./services/usage.service.js";

function createServices() {
	const usage = usageService(
		database.usage,
		() => process.env.NODE_ENV === "development" && process.env.DISABLE_USAGE_LIMITS === "true",
	);

	return {
		projects: projectService(database.projects, usage.chargeCredits, generateChatTitle),
		messages: messageService(database, usage.chargeCredits),
		usage,
	};
}

type Services = ReturnType<typeof createServices>;

/** Builds API application without binding a network port. */
type BuildAppOptions = Pick<FastifyServerOptions, "logger"> & {
	principalResolver?: PrincipalResolver;
	proPlanResolver?: ProPlanResolver;
	services?: Services;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
	if (!options.principalResolver) {
		assertClerkConfigured();
	}

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
		proPlanResolver: options.proPlanResolver,
		services: options.services ?? createServices(),
	});

	return app;
}
