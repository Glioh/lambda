import { registerMessageRoutes } from "./messages.routes.js";
import { registerProjectRoutes } from "./projects.routes.js";
import { registerUsageRoutes } from "./usage.routes.js";
import { defaultRouteDependencies, type ApiRouteDependencies } from "./dependencies.js";
import type { ApiFastifyInstance } from "./types.js";

export { defaultRouteDependencies, type ApiRouteDependencies } from "./dependencies.js";

export function registerRoutes(
	app: ApiFastifyInstance,
	dependencies: ApiRouteDependencies = defaultRouteDependencies,
) {
	registerProjectRoutes(app, dependencies);
	registerMessageRoutes(app, dependencies);
	registerUsageRoutes(app, dependencies);
}
