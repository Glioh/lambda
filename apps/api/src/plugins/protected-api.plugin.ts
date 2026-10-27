import type { PrincipalResolver, ProPlanResolver } from "../auth/auth-principal.js";
import type { ApiRouteDependencies } from "../routes/types.js";
import type { FastifyPluginAsync } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { registerMessageRoutes } from "../routes/messages.routes.js";
import { registerProjectRoutes } from "../routes/projects.routes.js";
import { registerUsageRoutes } from "../routes/usage.routes.js";
import { authPlugin } from "./auth.plugin.js";

export type ProtectedApiPluginOptions = {
	principalResolver?: PrincipalResolver;
	proPlanResolver?: ProPlanResolver;
	services: ApiRouteDependencies;
};

export const protectedApiPlugin: FastifyPluginAsync<ProtectedApiPluginOptions> = async (
	app,
	options,
) => {
	const api = app.withTypeProvider<TypeBoxTypeProvider>();
	api.register(authPlugin, {
		principalResolver: options.principalResolver,
		proPlanResolver: options.proPlanResolver,
	});
	api.register(async routes => {
		const routeApi = routes.withTypeProvider<TypeBoxTypeProvider>();
		registerProjectRoutes(routeApi, options.services);
		registerMessageRoutes(routeApi, options.services);
		registerUsageRoutes(routeApi, options.services);
	});
};
