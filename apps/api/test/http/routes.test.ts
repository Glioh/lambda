import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApiRouteDependencies } from "../../src/http/routes/dependencies.js";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";

type FakeMethod = (...args: unknown[]) => unknown;
type FakeDb = {
	project: Record<string, FakeMethod>;
	message: Record<string, FakeMethod>;
	$transaction: FakeMethod;
};

const USER_ID = "user-1";
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-01T00:01:00.000Z");
const attachment = {
	id: "attachment-1",
	mimeType: "image/png",
	width: 1,
	height: 1,
};
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString(
	"base64",
);

function projectRecord(id = "project-1") {
	return {
		id,
		name: "draft-project",
		createdAt,
		updatedAt,
		titleGeneratedAt: null,
	};
}

function messageRecord(id = "message-1") {
	return {
		id,
		content: "hello",
		role: "USER" as const,
		type: "RESULT" as const,
		createdAt,
		updatedAt,
		attachments: [],
	};
}

function createDb(
	overrides: { project?: Record<string, FakeMethod>; message?: Record<string, FakeMethod> } = {},
) {
	const db: FakeDb = {
		project: {
			findMany: async () => [],
			findFirst: async () => null,
			create: async () => projectRecord(),
			updateMany: async () => ({ count: 0 }),
			deleteMany: async () => ({ count: 0 }),
			update: async () => projectRecord(),
			...overrides.project,
		},
		message: {
			findMany: async () => [],
			findFirst: async () => null,
			create: async () => messageRecord(),
			update: async () => messageRecord(),
			deleteMany: async () => ({ count: 0 }),
			...overrides.message,
		},
		$transaction: async input =>
			Array.isArray(input)
				? Promise.all(input as Promise<unknown>[])
				: (input as (transactionDb: FakeDb) => Promise<unknown>)(db),
	};
	return db;
}

function createTestApp(
	db: FakeDb,
	options: Partial<
		Pick<ApiRouteDependencies, "chargeCredits" | "getUsageStatus" | "generateChatTitle">
	> = {},
) {
	const dependencies = {
		prisma: db as unknown as ApiRouteDependencies["prisma"],
		chargeCredits: async () => true,
		getUsageStatus: async () => null,
		generateChatTitle: async () => null,
		...options,
	} as ApiRouteDependencies;

	return buildApp({
		logger: false,
		principalResolver: () => ({ userId: USER_ID, sessionId: "session-1" }),
		routeDependencies: dependencies,
	});
}

async function close(app: FastifyInstance) {
	await app.close();
}

describe("project HTTP routes", () => {
	it("lists only owned projects with ISO timestamps", async () => {
		let where: unknown;
		const db = createDb({
			project: {
				findMany: async args => {
					where = (args as { where: unknown }).where;
					return [projectRecord()];
				},
			},
		});
		const app = createTestApp(db);

		try {
			const response = await app.inject({ method: "GET", url: "/api/projects" });

			assert.equal(response.statusCode, 200);
			assert.deepEqual((where as { userId: string }).userId, USER_ID);
			assert.deepEqual(response.json(), [
				{
					id: "project-1",
					name: "draft-project",
					createdAt: createdAt.toISOString(),
					updatedAt: updatedAt.toISOString(),
				},
			]);
		} finally {
			await close(app);
		}
	});

	it("masks project ownership on get", async () => {
		const db = createDb({ project: { findFirst: async () => null } });
		const app = createTestApp(db);

		try {
			const response = await app.inject({ method: "GET", url: "/api/projects/other-project" });

			assert.equal(response.statusCode, 404);
			assert.equal(response.json().statusCode, 404);
			assert.equal(response.json().error, "Not Found");
		} finally {
			await close(app);
		}
	});

	it("creates project and consumes exactly one credit", async () => {
		let credits = 0;
		let data: unknown;
		const db = createDb({
			project: {
				create: async args => {
					data = (args as { data: unknown }).data;
					return projectRecord();
				},
			},
		});
		const app = createTestApp(db, {
			chargeCredits: async () => {
				credits += 1;
				return true;
			},
		});

		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/projects",
				headers: { "content-type": "application/json" },
				payload: { value: "first message" },
			});

			assert.equal(response.statusCode, 201);
			assert.equal(credits, 1);
			assert.equal((data as { userId: string }).userId, USER_ID);
		} finally {
			await close(app);
		}
	});

	it("rejects malformed project bodies without coercion", async () => {
		const app = createTestApp(createDb());

		try {
			for (const value of [123, null, {}]) {
				const response = await app.inject({
					method: "POST",
					url: "/api/projects",
					headers: { "content-type": "application/json" },
					payload: { value },
				});
				assert.equal(response.statusCode, 400);
				assert.equal(response.json().code, "FST_ERR_VALIDATION");
			}
		} finally {
			await close(app);
		}
	});

	it("trims rename before length validation and does not consume credit", async () => {
		let credits = 0;
		let data: unknown;
		const db = createDb({
			project: {
				updateMany: async args => {
					data = (args as { data: unknown }).data;
					return { count: 1 };
				},
			},
		});
		const app = createTestApp(db, {
			chargeCredits: async () => {
				credits += 1;
				return true;
			},
		});

		try {
			const response = await app.inject({
				method: "PATCH",
				url: "/api/projects/project-1",
				headers: { "content-type": "application/json" },
				payload: { name: `     ${"a".repeat(100)}     ` },
			});

			assert.equal(response.statusCode, 200);
			assert.equal((data as { name: string }).name, "a".repeat(100));
			assert.equal(credits, 0);

			const tooLong = await app.inject({
				method: "PATCH",
				url: "/api/projects/project-1",
				headers: { "content-type": "application/json" },
				payload: { name: "a".repeat(101) },
			});
			assert.equal(tooLong.statusCode, 400);
		} finally {
			await close(app);
		}
	});

	it("rejects malformed rename bodies without coercion", async () => {
		const app = createTestApp(createDb());

		try {
			for (const name of [123, null, {}]) {
				const response = await app.inject({
					method: "PATCH",
					url: "/api/projects/project-1",
					headers: { "content-type": "application/json" },
					payload: { name },
				});
				assert.equal(response.statusCode, 400);
				assert.equal(response.json().code, "FST_ERR_VALIDATION");
			}
		} finally {
			await close(app);
		}
	});

	it("deletes only owned project", async () => {
		let where: unknown;
		const db = createDb({
			project: {
				deleteMany: async args => {
					where = (args as { where: unknown }).where;
					return { count: 1 };
				},
			},
		});
		const app = createTestApp(db);

		try {
			const response = await app.inject({ method: "DELETE", url: "/api/projects/project-1" });

			assert.equal(response.statusCode, 200);
			assert.deepEqual(where, { id: "project-1", userId: USER_ID });
			assert.deepEqual(response.json(), { id: "project-1" });
		} finally {
			await close(app);
		}
	});

	it("claims title generation and lets manual rename win", async () => {
		let updateCount = 0;
		let generated = 0;
		const db = createDb({
			project: {
				updateMany: async () => {
					updateCount += 1;
					return { count: updateCount === 1 ? 1 : 0 };
				},
			},
			message: {
				findMany: async () => [{ role: "USER", content: "hello", attachments: [] }],
			},
		});
		const app = createTestApp(db, {
			generateChatTitle: async () => {
				generated += 1;
				return "Generated title";
			},
		});

		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/generate-title",
			});

			assert.equal(response.statusCode, 200);
			assert.equal(response.json(), null);
			assert.equal(updateCount, 2);
			assert.equal(generated, 1);
		} finally {
			await close(app);
		}
	});
});

describe("message HTTP routes", () => {
	it("lists ordered messages with attachment metadata only", async () => {
		let orderBy: unknown;
		const db = createDb({
			project: { findFirst: async () => ({ id: "project-1" }) },
			message: {
				findMany: async args => {
					orderBy = (args as { orderBy: unknown }).orderBy;
					return [{ ...messageRecord(), attachments: [attachment] }];
				},
			},
		});
		const app = createTestApp(db);

		try {
			const response = await app.inject({
				method: "GET",
				url: "/api/projects/project-1/messages",
			});

			assert.equal(response.statusCode, 200);
			assert.deepEqual(orderBy, [{ createdAt: "asc" }, { type: "asc" }]);
			assert.deepEqual(response.json()[0].attachments, [attachment]);
			assert.equal("data" in response.json()[0].attachments[0], false);
		} finally {
			await close(app);
		}
	});

	it("creates image-only message and rejects invalid attachments", async () => {
		let created = 0;
		const db = createDb({
			project: { findFirst: async () => ({ id: "project-1" }) },
			message: {
				create: async () => {
					created += 1;
					return { ...messageRecord(), attachments: [attachment] };
				},
			},
		});
		const app = createTestApp(db);

		try {
			const valid = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages",
				headers: { "content-type": "application/json" },
				payload: {
					value: "",
					attachments: [{ mimeType: "image/png", data: png, width: 1, height: 1 }],
				},
			});
			assert.equal(valid.statusCode, 201);
			assert.equal(created, 1);

			const invalid = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages",
				headers: { "content-type": "application/json" },
				payload: {
					value: "",
					attachments: [{ mimeType: "image/jpeg", data: png, width: 1, height: 1 }],
				},
			});
			assert.equal(invalid.statusCode, 400);
			assert.equal(created, 1);
		} finally {
			await close(app);
		}
	});

	it("rejects malformed message bodies without coercion", async () => {
		const app = createTestApp(
			createDb({ project: { findFirst: async () => ({ id: "project-1" }) } }),
		);

		try {
			for (const value of [123, null, {}]) {
				const response = await app.inject({
					method: "POST",
					url: "/api/projects/project-1/messages",
					headers: { "content-type": "application/json" },
					payload: { value },
				});
				assert.equal(response.statusCode, 400);
				assert.equal(response.json().code, "FST_ERR_VALIDATION");
			}
		} finally {
			await close(app);
		}
	});

	it("edits a message and rolls back strictly after its timestamp", async () => {
		let deletedWhere: unknown;
		const db = createDb({
			project: { findFirst: async () => ({ id: "project-1" }) },
			message: {
				findFirst: async () => ({
					id: "message-1",
					role: "USER",
					createdAt,
					attachments: [],
				}),
				update: async () => messageRecord(),
				deleteMany: async args => {
					deletedWhere = (args as { where: unknown }).where;
					return { count: 1 };
				},
			},
		});
		const app = createTestApp(db);

		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages/message-1/edit-and-resend",
				headers: { "content-type": "application/json" },
				payload: { value: " edited " },
			});

			assert.equal(response.statusCode, 200);
			assert.deepEqual(response.json(), { value: "edited", hasAttachments: false });
			assert.deepEqual(deletedWhere, { projectId: "project-1", createdAt: { gt: createdAt } });
		} finally {
			await close(app);
		}
	});

	it("trims edit input after validation and preserves validation errors", async () => {
		let updatedContent: unknown;
		let updates = 0;
		let credits = 0;
		const db = createDb({
			project: { findFirst: async () => ({ id: "project-1" }) },
			message: {
				findFirst: async () => ({
					id: "message-1",
					role: "USER",
					createdAt,
					attachments: [],
				}),
				update: async args => {
					updates += 1;
					updatedContent = (args as { data: { content: unknown } }).data.content;
					return messageRecord();
				},
			},
		});
		const app = createTestApp(db, {
			chargeCredits: async () => {
				credits += 1;
				return true;
			},
		});

		try {
			const overLimitAfterTrim = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages/message-1/edit-and-resend",
				headers: { "content-type": "application/json" },
				payload: { value: ` ${"a".repeat(10_000)} ` },
			});
			assert.equal(overLimitAfterTrim.statusCode, 400);
			assert.equal(updates, 0);

			const valid = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages/message-1/edit-and-resend",
				headers: { "content-type": "application/json" },
				payload: { value: " \t edited \n" },
			});
			assert.equal(valid.statusCode, 200);
			assert.equal(updatedContent, "edited");
			assert.equal(updates, 1);

			const whitespaceOnly = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages/message-1/edit-and-resend",
				headers: { "content-type": "application/json" },
				payload: { value: " \t\n" },
			});
			assert.equal(whitespaceOnly.statusCode, 400);
			assert.equal(updates, 1);

			for (const value of [123, null, {}]) {
				const malformed = await app.inject({
					method: "POST",
					url: "/api/projects/project-1/messages/message-1/edit-and-resend",
					headers: { "content-type": "application/json" },
					payload: { value },
				});
				assert.equal(malformed.statusCode, 400);
				assert.equal(malformed.json().code, "FST_ERR_VALIDATION");
			}
			const missing = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages/message-1/edit-and-resend",
				headers: { "content-type": "application/json" },
				payload: {},
			});
			assert.equal(missing.statusCode, 400);
			assert.equal(credits, 2);
		} finally {
			await close(app);
		}
	});

	it("allows whitespace-only edit when the target has attachments", async () => {
		let updatedContent: unknown;
		const db = createDb({
			project: { findFirst: async () => ({ id: "project-1" }) },
			message: {
				findFirst: async () => ({
					id: "message-1",
					role: "USER",
					createdAt,
					attachments: [attachment],
				}),
				update: async args => {
					updatedContent = (args as { data: { content: unknown } }).data.content;
					return messageRecord();
				},
			},
		});
		const app = createTestApp(db, { chargeCredits: async () => true });

		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages/message-1/edit-and-resend",
				headers: { "content-type": "application/json" },
				payload: { value: " \t\n" },
			});

			assert.equal(response.statusCode, 200);
			assert.deepEqual(response.json(), { value: "", hasAttachments: true });
			assert.equal(updatedContent, "");
		} finally {
			await close(app);
		}
	});

	it("retries an answer using prior prompt and gte rollback", async () => {
		let deletedWhere: unknown;
		let findCount = 0;
		const db = createDb({
			project: { findFirst: async () => ({ id: "project-1" }) },
			message: {
				findFirst: async () => {
					findCount += 1;
					return findCount === 1
						? { role: "ASSISTANT", type: "RESULT", createdAt, content: "answer", attachments: [] }
						: { content: "prompt", attachments: [attachment] };
				},
				deleteMany: async args => {
					deletedWhere = (args as { where: unknown }).where;
					return { count: 1 };
				},
			},
		});
		const app = createTestApp(db);

		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/projects/project-1/messages/message-1/retry",
			});

			assert.equal(response.statusCode, 200);
			assert.deepEqual(response.json(), { value: "prompt", hasAttachments: true });
			assert.deepEqual(deletedWhere, { projectId: "project-1", createdAt: { gte: createdAt } });
		} finally {
			await close(app);
		}
	});
});

describe("usage and HTTP limits", () => {
	it("keeps the larger body limit off non-attachment routes", async () => {
		const app = createTestApp(createDb());

		try {
			const response = await app.inject({
				method: "PATCH",
				url: "/api/projects/project-1",
				headers: { "content-type": "application/json" },
				payload: { name: "x".repeat(1_100_000) },
			});

			assert.equal(response.statusCode, 413);
		} finally {
			await close(app);
		}
	});

	it("returns nullable and consumed usage status", async () => {
		const db = createDb();
		const app = createTestApp(db, {
			getUsageStatus: async (_request, userId) =>
				(userId === USER_ID
					? {
							remainingPoints: 3,
							msBeforeNext: 1000,
							consumedPoints: 1,
							isFirstInDuration: false,
							toJSON: () => ({ remainingPoints: 3, msBeforeNext: 1000 }),
						}
					: null) as Awaited<ReturnType<ApiRouteDependencies["getUsageStatus"]>>,
		});

		try {
			const response = await app.inject({ method: "GET", url: "/api/usage" });
			assert.equal(response.statusCode, 200);
			assert.deepEqual(response.json(), { remainingPoints: 3, msBeforeNext: 1000 });
		} finally {
			await close(app);
		}
	});

	it("returns 429 when a credit-consuming operation is exhausted", async () => {
		const db = createDb();
		const app = createTestApp(db, {
			chargeCredits: async (_request, _userId, reply) => {
				reply.code(429).send({
					statusCode: 429,
					code: "USAGE_LIMIT_EXCEEDED",
					error: "Too Many Requests",
					message: "Usage limit exceeded.",
				});
				return false;
			},
		});

		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/projects",
				headers: { "content-type": "application/json" },
				payload: { value: "hello" },
			});

			assert.equal(response.statusCode, 429);
			assert.equal(response.json().code, "USAGE_LIMIT_EXCEEDED");
		} finally {
			await close(app);
		}
	});

	it("rejects oversized attachment requests with Fastify's error response", async () => {
		const app = createTestApp(createDb());

		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/projects",
				headers: { "content-type": "application/json" },
				payload: {
					value: "x",
					attachments: [
						{ mimeType: "image/png", data: "A".repeat(4_500_000), width: 1, height: 1 },
					],
				},
			});

			assert.equal(response.statusCode, 413);
			assert.equal(response.json().statusCode, 413);
			assert.equal(response.json().error, "Payload Too Large");
			assert.equal(response.json().code, "FST_ERR_CTP_BODY_TOO_LARGE");
		} finally {
			await close(app);
		}
	});
});
