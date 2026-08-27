import assert from "node:assert/strict";
import { describe, it } from "node:test";
import nextConfig from "../../../next.config";

describe("Fastify rewrites", () => {
	it("uses resource-family project and usage rewrites only", async () => {
		const rewrites = await nextConfig.rewrites?.();
		assert.ok(Array.isArray(rewrites));

		assert.deepEqual(rewrites, [
			{
				source: "/api/projects/:path*",
				destination: "http://localhost:4000/api/projects/:path*",
			},
			{
				source: "/api/usage",
				destination: "http://localhost:4000/api/usage",
			},
		]);
		assert.equal(
			rewrites.some(rewrite => rewrite.source === "/api/chat"),
			false,
		);
	});
});
