import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectsRepository } from "../../src/database/repositories/projects.repository.js";

describe("projectsRepository title lifecycle", () => {
	it("finds only a project owned by the requested user", async () => {
		let query: unknown;
		const repository = projectsRepository({
			project: {
				findFirst: async (args: unknown) => {
					query = args;
					return null;
				},
			},
		} as never);

		assert.equal(await repository.findById("user-1", "project-1"), null);
		assert.deepEqual(query, {
			where: { id: "project-1", userId: "user-1" },
			select: { id: true, name: true, createdAt: true, updatedAt: true, titleFinalized: true },
		});
	});

	it("creates the unfinished project, first message and attachments in one write", async () => {
		const attachments = [
			{ mimeType: "image/png" as const, data: "image", width: 1, height: 1, byteSize: 5 },
		];
		let created: unknown;
		const repository = projectsRepository({
			project: {
				create: async (args: unknown) => {
					created = args;
				},
			},
		} as never);
		await repository.create("owner", "New project", "", attachments);
		assert.deepEqual(created, {
			data: {
				userId: "owner",
				name: "New project",
				titleFinalized: false,
				messages: {
					create: {
						content: "",
						role: "USER",
						type: "RESULT",
						attachments: { create: attachments },
					},
				},
			},
			select: { id: true, name: true, createdAt: true, updatedAt: true, titleFinalized: true },
		});
	});

	it("loads only the first two non-summary messages and attachment existence for an owned unfinished title", async () => {
		const messages = [{ role: "USER", content: "prompt", attachments: [{ id: "image" }] }];
		let query: unknown;
		const repository = projectsRepository({
			project: {
				findFirst: async (args: unknown) => {
					query = args;
					return { messages };
				},
			},
		} as never);
		assert.deepEqual(await repository.getTitleContext("owner", "project"), messages);
		assert.deepEqual(query, {
			where: { id: "project", userId: "owner", titleFinalized: false },
			select: {
				messages: {
					where: { type: { not: "SUMMARY" } },
					orderBy: { createdAt: "asc" },
					take: 2,
					select: { role: true, content: true, attachments: { select: { id: true }, take: 1 } },
				},
			},
		});
	});

	for (const name of ["Generated title", null]) {
		it(`finalizes ${name ?? "without replacing the default"} and prevents stale or unowned writes`, async () => {
			const project = {
				id: "project",
				userId: "owner",
				name: "Default title",
				titleFinalized: false,
			};
			const matches = (where: object) =>
				Object.entries(where).every(
					([key, value]) => project[key as keyof typeof project] === value,
				);
			const repository = projectsRepository({
				project: {
					findFirst: async ({ where }: { where: object }) =>
						matches(where) ? { messages: [] } : null,
					updateMany: async ({ where, data }: { where: object; data: object }) => {
						if (!matches(where)) return { count: 0 };
						Object.assign(project, data);
						return { count: 1 };
					},
				},
			} as never);

			assert.equal(await repository.getTitleContext("other-user", "project"), null);
			assert.deepEqual(await repository.agentRename("other-user", "project", "Intruder"), {
				count: 0,
			});
			assert.deepEqual(await repository.rename("owner", "project", "Too early"), { count: 0 });
			assert.deepEqual(await repository.agentRename("owner", "project", name), { count: 1 });
			assert.equal(project.name, name ?? "Default title");
			assert.equal(project.titleFinalized, true);
			assert.equal(await repository.getTitleContext("owner", "project"), null);
			assert.deepEqual(await repository.rename("other-user", "project", "Intruder"), { count: 0 });
			assert.deepEqual(await repository.rename("owner", "project", "Manual title"), { count: 1 });
			assert.deepEqual(await repository.agentRename("owner", "project", "Stale title"), {
				count: 0,
			});
			assert.equal(project.name, "Manual title");
		});
	}
});
