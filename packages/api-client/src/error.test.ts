import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getProject } from "./generated/client/projects/getProject";

describe("Kubb Fetch errors", () => {
	it("preserves Fastify ErrorResponse on normal non-2xx calls", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					statusCode: 404,
					code: "PROJECT_NOT_FOUND",
					error: "Not Found",
					message: "Project missing",
				}),
				{
					status: 404,
					headers: { "content-type": "application/json" },
				},
			);
		try {
			await assert.rejects(
				getProject({ baseURL: "http://api.test", path: { projectId: "missing" } }),
				error => {
					const responseError = error as { status?: number; data?: unknown };
					assert.equal(responseError.status, 404);
					assert.deepEqual(responseError.data, {
						statusCode: 404,
						code: "PROJECT_NOT_FOUND",
						error: "Not Found",
						message: "Project missing",
					});
					return true;
				},
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
