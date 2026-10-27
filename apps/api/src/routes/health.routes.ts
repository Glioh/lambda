import type { ApiFastifyInstance } from "./types.js";

const healthResponseSchema = {
	type: "object",
	additionalProperties: false,
	required: ["status"],
	properties: {
		status: { type: "string", enum: ["ok"] },
	},
} as const;

export function registerHealthRoutes(app: ApiFastifyInstance) {
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
}
