import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { projectsRepository } from "../../src/database/repositories/projects.repository.js";
import { deriveDefaultTitle, projectService } from "../../src/services/project.service.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString(
	"base64",
);

function repository(overrides: Partial<ReturnType<typeof projectsRepository>> = {}) {
	return {
		list: async () => [],
		findById: async () => null,
		create: async () => ({ id: "project-1" }),
		rename: async () => ({ count: 0 }),
		delete: async () => ({ count: 0 }),
		getTitleContext: async () => null,
		agentRename: async () => ({ count: 0 }),
		...overrides,
	} as unknown as ReturnType<typeof projectsRepository>;
}

describe("deriveDefaultTitle", () => {
	for (const [input, expected] of [
		[
			"Can you help me understand binary search trees in Java please?",
			"Can you help me understand binary search trees in Java",
		],
		["A short message", "A short message"],
		["  multiple   spaces\tand\nnewlines  ", "multiple spaces and newlines"],
		["", "New project"],
		[" \t\n", "New project"],
	]) {
		it(`derives ${JSON.stringify(expected)} from ${JSON.stringify(input)}`, () => {
			assert.equal(deriveDefaultTitle(input), expected);
		});
	}
});

describe("projectService", () => {
	it("masks missing owned projects", async () => {
		const service = projectService(
			repository(),
			async () => {},
			async () => null,
		);

		await assert.rejects(
			() => service.get("user-1", "project-1"),
			error => {
				assert.equal((error as { code: string }).code, "NOT_FOUND");
				return true;
			},
		);
	});

	it("charges requested plan and passes validated attachments to create", async () => {
		let charge: unknown;
		let createArgs: unknown[] = [];
		const service = projectService(
			repository({
				create: async (...args) => {
					createArgs = args;
					return { id: "project-1" };
				},
			}),
			async (...args) => {
				charge = args;
			},
			async () => null,
		);

		await service.create(
			"user-1",
			{
				value: "",
				attachments: [{ mimeType: "image/png", data: png, width: 1, height: 1 }],
			},
			true,
		);

		assert.deepEqual(charge, ["user-1", true]);
		assert.equal(createArgs[0], "user-1");
		assert.equal(createArgs[1], "New project");
		assert.equal(createArgs[2], "");
		assert.deepEqual(createArgs[3], [
			{ mimeType: "image/png", data: png, width: 1, height: 1, byteSize: 12 },
		]);
	});

	it("trims manual rename", async () => {
		let renameArgs: unknown[] = [];
		const service = projectService(
			repository({
				rename: async (...args) => {
					renameArgs = args;
					return { count: 1 };
				},
			}),
			async () => {},
			async () => null,
		);

		assert.deepEqual(await service.rename("user-1", "project-1", "  renamed  "), {
			id: "project-1",
			name: "renamed",
		});
		assert.deepEqual(renameArgs, ["user-1", "project-1", "renamed"]);
	});

	it("returns null when a generated title loses to prior finalization", async () => {
		let saved = false;
		const service = projectService(
			repository({
				getTitleContext: async () => [{ role: "USER", content: "hello", attachments: [] }],
				agentRename: async () => {
					saved = true;
					return { count: 0 };
				},
			}),
			async () => {},
			async () => "Generated title",
		);

		assert.equal(await service.generateTitle("user-1", "project-1"), null);
		assert.equal(saved, true);
	});

	it("does not call the agent without owned, unfinished context", async () => {
		const service = projectService(
			repository(),
			async () => {},
			async () => {
				assert.fail("Title agent must not run");
			},
		);
		assert.equal(await service.generateTitle("other-user", "project-1"), null);
	});

	for (const outcome of ["Generated title", null, "throw"] as const) {
		it(`finalizes the automatic attempt when the agent returns ${outcome}`, async () => {
			let renameArgs: unknown[] = [];
			const service = projectService(
				repository({
					getTitleContext: async (userId, id) => {
						assert.deepEqual([userId, id], ["user-1", "project-1"]);
						return [{ role: "USER", content: "", attachments: [{ id: "image-1" }] }];
					},
					agentRename: async (...args) => {
						renameArgs = args;
						return { count: 1 };
					},
				}),
				async () => {},
				async messages => {
					assert.deepEqual(messages, [{ role: "USER", content: "", hasImage: true }]);
					if (outcome === "throw") throw new Error("Provider unavailable");
					return outcome;
				},
			);
			const name = outcome === "throw" ? null : outcome;
			assert.deepEqual(
				await service.generateTitle("user-1", "project-1"),
				name ? { id: "project-1", name } : null,
			);
			assert.deepEqual(renameArgs, ["user-1", "project-1", name]);
		});
	}

	it("distinguishes a pending title from a missing or unowned project", async () => {
		for (const project of [null, { id: "project-1", titleFinalized: false }]) {
			const service = projectService(
				repository({ findById: async () => project as never }),
				async () => {},
				async () => null,
			);
			await assert.rejects(service.rename("user-1", "project-1", "Renamed"), {
				code: project ? "CONFLICT" : "NOT_FOUND",
			});
		}
	});

	it("rejects invalid titles before attempting a manual rename", async () => {
		const service = projectService(
			repository({ rename: async () => assert.fail("Invalid title must not be saved") }),
			async () => {},
			async () => null,
		);
		for (const name of [" \t", "x".repeat(101)]) {
			await assert.rejects(service.rename("user-1", "project-1", name), { code: "INVALID_INPUT" });
		}
	});
});
