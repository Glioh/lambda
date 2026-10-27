import type { ApiFastifyInstance, ApiRouteDependencies } from "./types.js";
import { schemaRef, UsageSchema } from "../contracts/index.js";
import { getAuthPrincipal, getProPlan } from "../plugins/auth.plugin.js";

export function registerUsageRoutes(app: ApiFastifyInstance, dependencies: ApiRouteDependencies) {
	const { getUsageStatus } = dependencies.usage;

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
			const status = await getUsageStatus(auth.userId, getProPlan(request));
			return status
				? {
						remainingPoints: status.remainingPoints,
						msBeforeNext: status.msBeforeNext,
					}
				: null;
		},
	);
}
