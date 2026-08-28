import type { FastifyPluginAsync } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerOpenApiRoutes } from "./routes/openapi.routes.js";

export const publicApiPlugin: FastifyPluginAsync = async app => {
	const api = app.withTypeProvider<TypeBoxTypeProvider>();
	registerHealthRoutes(api);
	registerOpenApiRoutes(api);
};
