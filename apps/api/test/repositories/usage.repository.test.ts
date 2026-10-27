import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { usageRepository } from "../../src/database/repositories/usage.repository.js";

describe("usageRepository", () => {
	it("returns false for rate-limiter exhaustion without creating an application error", async () => {
		const prisma = {
			Usage: {
				findFirst: async () => ({
					points: 10,
					expire: new Date(Date.now() + 60_000),
				}),
				update: async () => ({
					points: 11,
					expire: new Date(Date.now() + 60_000),
				}),
			},
			$transaction: async (work: (client: unknown) => Promise<unknown>) => work(prisma),
		} as never;

		assert.equal(await usageRepository(prisma).consume("user-1", 10, 60), false);
	});

	it("propagates unexpected persistence failures", async () => {
		const failure = new Error("database down");
		const prisma = {
			Usage: { findFirst: async () => null },
			$transaction: async () => {
				throw failure;
			},
		} as never;

		await assert.rejects(() => usageRepository(prisma).consume("user-1", 10, 60), failure);
	});
});
