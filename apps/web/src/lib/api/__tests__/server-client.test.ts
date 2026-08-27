import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { getProject } from "@lambda/api-client";

describe("createServerApiClient request isolation", () => {
	it("forwards request-scoped non-empty credentials only", async () => {
		const incomingHeaders = [
			new Headers({ authorization: "Bearer user-a", cookie: "session=user-a" }),
			new Headers({ authorization: "Bearer user-b", cookie: "session=user-b" }),
			new Headers({ authorization: "", cookie: "" }),
			new Headers(),
		];
		mock.module("next/headers", {
			namedExports: { headers: async () => incomingHeaders.shift()! },
		});
		mock.module("server-only", { namedExports: {} });

		const previousApiUrl = process.env.API_URL;
		process.env.API_URL = "http://api.test";
		try {
			const { createServerApiClient } = await import("../server-client");
			const [clientA, clientB, emptyCredentialsClient, noCredentialsClient] = await Promise.all([
				createServerApiClient(),
				createServerApiClient(),
				createServerApiClient(),
				createServerApiClient(),
			]);

			const requestHeaders = async (client: Parameters<typeof getProject>[0]["client"]) => {
				let headers: Record<string, string> | undefined;
				await getProject({
					client,
					path: { projectId: "project-1" },
					transport: async request => {
						headers = request.headers;
						return {
							data: { id: "project-1" },
							status: 200,
							statusText: "OK",
							headers: new Headers({ "content-type": "application/json" }),
							request: new Request(request.url, { method: request.method }),
							response: Response.json({ id: "project-1" }),
						};
					},
				});
				return headers;
			};

			const [headersA, headersB, emptyCredentialsHeaders, noCredentialsHeaders] = await Promise.all(
				[
					requestHeaders(clientA),
					requestHeaders(clientB),
					requestHeaders(emptyCredentialsClient),
					requestHeaders(noCredentialsClient),
				],
			);
			assert.notStrictEqual(clientA, clientB);
			assert.deepEqual(headersA, {
				authorization: "Bearer user-a",
				cookie: "session=user-a",
			});
			assert.deepEqual(headersB, {
				authorization: "Bearer user-b",
				cookie: "session=user-b",
			});
			assert.deepEqual(emptyCredentialsHeaders, {});
			assert.deepEqual(noCredentialsHeaders, {});
		} finally {
			if (previousApiUrl === undefined) delete process.env.API_URL;
			else process.env.API_URL = previousApiUrl;
		}
	});
});
