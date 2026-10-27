import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { messagesRepository } from "../../src/database/repositories/messages.repository.js";

const attachment = {
	mimeType: "image/png" as const,
	data: "data",
	width: 1,
	height: 1,
	byteSize: 12,
};

describe("messagesRepository", () => {
	it("deletes from boundary with required inclusive option and project scope", async () => {
		const boundary = new Date("2026-01-01T00:00:00.000Z");
		const deletions: unknown[] = [];
		const db = {
			message: { deleteMany: async (args: unknown) => deletions.push(args) },
		} as never;
		const repository = messagesRepository(db);

		await repository.deleteMessagesFrom("project-1", boundary, { inclusive: false });
		await repository.deleteMessagesFrom("project-1", boundary, { inclusive: true });

		assert.deepEqual(deletions, [
			{ where: { projectId: "project-1", createdAt: { gt: boundary } } },
			{ where: { projectId: "project-1", createdAt: { gte: boundary } } },
		]);
	});

	it("creates messages with validated attachments", async () => {
		let args: unknown;
		const db = {
			message: {
				create: async (value: unknown) => {
					args = value;
					return { id: "message-1" };
				},
			},
		} as never;

		await messagesRepository(db).create("project-1", "hello", [attachment]);

		assert.deepEqual(args, {
			data: {
				projectId: "project-1",
				content: "hello",
				role: "USER",
				type: "RESULT",
				attachments: { create: [attachment] },
			},
			select: {
				id: true,
				content: true,
				role: true,
				type: true,
				createdAt: true,
				updatedAt: true,
				attachments: {
					select: { id: true, mimeType: true, width: true, height: true },
					orderBy: { createdAt: "asc" },
				},
			},
		});
	});
});
