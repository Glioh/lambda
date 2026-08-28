import type { PrincipalResolver } from "../auth/auth-principal.js";
import type { ApiRouteDependencies } from "./routes/dependencies.js";
import type { FastifyPluginAsync } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { authPlugin } from "../plugins/auth.plugin.js";
import { registerMessageRoutes } from "./routes/messages.routes.js";
import { registerProjectRoutes } from "./routes/projects.routes.js";
import { registerUsageRoutes } from "./routes/usage.routes.js";

export type ProtectedApiPluginOptions = {
	principalResolver?: PrincipalResolver;
	dependencies: ApiRouteDependencies;
};

export const protectedApiPlugin: FastifyPluginAsync<ProtectedApiPluginOptions> = async (
	app,
	options,
) => {
	const api = app.withTypeProvider<TypeBoxTypeProvider>();
	api.register(authPlugin, { principalResolver: options.principalResolver });
	api.register(async routes => {
		const routeApi = routes.withTypeProvider<TypeBoxTypeProvider>();
		registerProjectRoutes(routeApi, options.dependencies);
		registerMessageRoutes(routeApi, options.dependencies);
		registerUsageRoutes(routeApi, options.dependencies);
	});
};
