import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Kubb package boundaries", () => {
	it("keeps the generic client factory out of UI runtimes", () => {
		const client = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
		assert.doesNotMatch(client, /next|server-only|react|@tanstack\/react-query/);
	});

	it("keeps the core generated client free of UI runtimes", () => {
		const clientModule = readFileSync(
			new URL("./generated/client/index.ts", import.meta.url),
			"utf8",
		);
		assert.doesNotMatch(clientModule, /react|@tanstack\/react-query/);
	});

	it("generates query options and keys without hook runtime", () => {
		const queryModule = readFileSync(
			new URL("./generated/query/projects/useGetProject.ts", import.meta.url),
			"utf8",
		);
		assert.match(queryModule, /queryOptions/);
		assert.match(queryModule, /getProjectQueryKey/);
		assert.doesNotMatch(queryModule, /useQuery/);
	});
});
