import { getAuthPrincipal } from "../../auth/clerk-auth.js";
import { schemaRef, UsageSchema } from "@lambda/api-contracts";
import { defaultRouteDependencies, type ApiRouteDependencies } from "./dependencies.js";
import type { ApiFastifyInstance } from "./types.js";

export function registerUsageRoutes(
	app: ApiFastifyInstance,
	dependencies: ApiRouteDependencies = defaultRouteDependencies,
) {
	const { getUsageStatus } = dependencies;

	app.get(
		"/api/usage",
		{
			schema: {
				tags: ["usage"],
				operationId: "getUsage",
				response: {
					200: { anyOf: [schemaRef(UsageSchema), { type: "null" }] },
				},
			},
		},
		async request => {
			const auth = getAuthPrincipal(request);
			const status = await getUsageStatus(request, auth.userId);
			return status
				? {
						remainingPoints: status.remainingPoints,
						msBeforeNext: status.msBeforeNext,
					}
				: null;
		},
	);
}
