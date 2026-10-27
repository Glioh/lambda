import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Database } from "../../src/database/database.js";
import type { messagesRepository } from "../../src/database/repositories/messages.repository.js";
import { messageService } from "../../src/services/message.service.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString(
	"base64",
);

function database(overrides: Partial<ReturnType<typeof messagesRepository>> = {}) {
	const messages = {
		list: async () => [],
		create: async () => ({ id: "message-1" }),
		target: async () => null,
		priorPrompt: async () => null,
		edit: async () => ({}),
		deleteMessagesFrom: async () => ({ count: 0 }),
		...overrides,
	};
	const projects = {
		findById: async () => ({ id: "project-1" }),
		touch: async () => ({}),
	};
	return {
		messages,
		projects,
		transaction: async work => work({ messages, projects } as never),
	} as unknown as Pick<Database, "messages" | "projects" | "transaction">;
}

describe("messageService", () => {
	it("accepts image-only messages and charges their tier", async () => {
		let charge: unknown;
		let createArgs: unknown[] = [];
		const service = messageService(
			database({
				create: async (...args) => {
					createArgs = args;
					return { id: "message-1" };
				},
			}),
			async (...args) => {
				charge = args;
			},
		);

		await service.create(
			"user-1",
			"project-1",
			{ value: "", attachments: [{ mimeType: "image/png", data: png, width: 1, height: 1 }] },
			true,
		);

		assert.deepEqual(charge, ["user-1", true]);
		assert.equal(createArgs[0], "project-1");
		assert.deepEqual(createArgs[2], [
			{ mimeType: "image/png", data: png, width: 1, height: 1, byteSize: 12 },
		]);
	});

	it("rejects edits to non-user messages before mutation", async () => {
		let edited = false;
		const service = messageService(
			database({
				target: async () => ({ role: "ASSISTANT", attachments: [], createdAt: new Date() }),
				edit: async () => {
					edited = true;
				},
			}),
			async () => {},
		);

		await assert.rejects(
			() => service.edit("user-1", "project-1", "message-1", "new text"),
			error => {
				assert.equal((error as { code: string }).code, "INVALID_INPUT");
				return true;
			},
		);
		assert.equal(edited, false);
	});

	it("keeps the selected user message for edit and retry", async () => {
		const calls: unknown[] = [];
		const service = messageService(
			database({
				target: async () => ({
					id: "message-1",
					role: "USER",
					type: "RESULT",
					content: "original",
					createdAt: new Date("2026-01-01"),
					attachments: [],
				}),
				edit: async (...args) => {
					calls.push(["edit", ...args]);
					return {} as never;
				},
				deleteMessagesFrom: async (...args) => {
					calls.push(["deleteMessagesFrom", ...args]);
					return { count: 1 };
				},
			}),
			async () => {},
		);

		await service.edit("user-1", "project-1", "message-1", "updated");
		await service.retry("user-1", "project-1", "message-1");

		assert.deepEqual(calls, [
			["edit", "message-1", "updated"],
			["deleteMessagesFrom", "project-1", new Date("2026-01-01"), { inclusive: false }],
			["deleteMessagesFrom", "project-1", new Date("2026-01-01"), { inclusive: false }],
		]);
	});

	it("rejects SUMMARY retry and deletes an answer from its prior prompt", async () => {
		let deletionOptions: unknown;
		const service = messageService(
			database({
				target: async () => ({
					role: "ASSISTANT",
					type: "RESULT",
					createdAt: new Date("2026-01-01"),
					attachments: [],
				}),
				priorPrompt: async () => ({ content: "prompt", attachments: [{ id: "attachment-1" }] }),
				deleteMessagesFrom: async (_projectId, _boundary, options) => {
					deletionOptions = options;
					return { count: 1 };
				},
			}),
			async () => {},
		);

		assert.deepEqual(await service.retry("user-1", "project-1", "message-1"), {
			value: "prompt",
			hasAttachments: true,
		});
		assert.deepEqual(deletionOptions, { inclusive: true });

		const summaryService = messageService(
			database({
				target: async () => ({ type: "SUMMARY" }),
			}),
			async () => {},
		);
		await assert.rejects(() => summaryService.retry("user-1", "project-1", "message-1"));
	});
});
