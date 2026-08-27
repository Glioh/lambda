import type { ApiFastifyInstance } from "./types.js";

export function registerOpenApiRoutes(app: ApiFastifyInstance) {
	app.get("/api/openapi.json", { schema: { hide: true } }, async () => app.swagger());
}
