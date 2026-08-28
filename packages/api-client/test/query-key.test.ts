import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getProjectQueryKey, listProjectsQueryKey } from "@lambda/api-client/query";
import { hashKey } from "@tanstack/react-query";

describe("Kubb query identity", () => {
	it("excludes transport origin and differentiates path params", () => {
		assert.notDeepEqual(
			getProjectQueryKey({ path: { projectId: "project-1" } }),
			getProjectQueryKey({ path: { projectId: "project-2" } }),
		);
		assert.deepEqual(listProjectsQueryKey(), [{ url: "/api/projects" }]);
	});
});

describe("TanStack query hashing", () => {
	it("hashes omitted query and nested undefined identically", () => {
		const omitted = [{ url: "/api/projects", query: {} }];
		const nestedUndefined = [{ url: "/api/projects", query: { optionalParam: undefined } }];

		assert.notDeepEqual(omitted, nestedUndefined);
		assert.equal(hashKey(omitted), hashKey(nestedUndefined));
	});
});
