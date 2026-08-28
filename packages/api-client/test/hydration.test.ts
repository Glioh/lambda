import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Transport } from "../src/generated/.kubb/client";
import { dehydrate, hydrate, QueryClient } from "@tanstack/react-query";
import { getProjectQueryKey, getProjectQueryOptions, } from "../src/generated/query/projects/useGetProject";

const project = { id: "project-1", name: "Hydrated project" };

describe("generated Kubb query options", () => {
	it("prefetches in RSC, dehydrates, hydrates, and reads in a Client Component", async () => {
		const requests: string[] = [];
		const transport: Transport = async request => {
			requests.push(request.url);
			return {
				data: project,
				status: 200,
				statusText: "OK",
				headers: new Headers({ "content-type": "application/json" }),
				request: new Request(request.url, { method: request.method }),
				response: Response.json(project),
			};
		};
		const queryInput = { path: { projectId: project.id } };

		const rscQueryClient = new QueryClient();
		await rscQueryClient.prefetchQuery(
			getProjectQueryOptions(queryInput, { baseURL: "http://api.test", transport }),
		);
		const dehydrated = dehydrate(rscQueryClient);

		const clientQueryClient = new QueryClient({
			defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
		});
		hydrate(clientQueryClient, dehydrated);
		const hydratedState = clientQueryClient.getQueryState(getProjectQueryKey(queryInput));
		assert.deepEqual(hydratedState?.data, project);

		const result = await clientQueryClient.fetchQuery(
			getProjectQueryOptions(queryInput, { baseURL: "http://api.test", transport }),
		);
		assert.deepEqual(result, project);
		assert.deepEqual(requests, ["http://api.test/api/projects/project-1"]);
	});
});
