import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabase } from "../../src/database/database.js";

describe("database transactions", () => {
	it("uses one transaction client across repositories and propagates transaction failure", async () => {
		const clients: unknown[] = [];
		let rolledBack = false;
		const db = {
			message: {},
			project: {},
			$transaction: async (work: (transactionClient: unknown) => Promise<unknown>) => {
				const transactionClient = {
					message: { create: async () => clients.push(transactionClient) },
					project: { update: async () => clients.push(transactionClient) },
				};
				try {
					return await work(transactionClient);
				} catch (error) {
					rolledBack = true;
					throw error;
				}
			},
		} as never;
		const database = createDatabase(db);

		await assert.rejects(
			database.transaction(async ({ messages, projects }) => {
				assert.equal("usage" in { messages, projects }, false);
				await messages.create("project-1", "hello", []);
				await projects.touch("project-1", new Date());
				throw new Error("rollback");
			}),
			/rollback/,
		);

		assert.equal(clients.length, 2);
		assert.equal(clients[0], clients[1]);
		assert.equal(rolledBack, true);
	});
});
