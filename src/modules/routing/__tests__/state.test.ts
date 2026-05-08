import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, type RunStatus } from "@prisma/client";
import { isTerminal, STATE_TRANSITIONS, transition } from "../state";

type RunRow = {
	id: string;
	status: RunStatus;
	draftValue: string;
	dispatchedAt?: Date;
	startedAt?: Date;
	completedAt?: Date;
	errorSummary?: string;
};

function createFakePrisma(initialRuns: RunRow[]) {
	const runs = new Map(initialRuns.map((run) => [run.id, { ...run }]));

	return {
		prisma: {
			run: {
				async update({
					where,
					data,
				}: {
					where: { id: string; status?: RunStatus };
					data: Prisma.RunUpdateInput;
				}) {
					const row = runs.get(where.id);

					if (!row || (where.status && row.status !== where.status)) {
						throw Object.assign(new Error("No Run found"), {
							code: "P2025",
						});
					}

					const updated = { ...row, ...data } as RunRow;
					runs.set(where.id, updated);
					return updated;
				},
			},
		},
		runs,
	};
}

async function guardedTransition(
	fakePrisma: ReturnType<typeof createFakePrisma>["prisma"],
	runId: string,
	from: RunStatus,
	to: RunStatus,
	patch: Partial<RunRow> = {},
) {
	assert.ok((STATE_TRANSITIONS[from] ?? []).includes(to));
	return transition(fakePrisma, runId, from, to, patch);
}

describe("run state helpers", () => {
	it("dispatched -> running transition succeeds", async () => {
		const { prisma } = createFakePrisma([
			{ id: "run-1", status: "dispatched", draftValue: "build it" },
		]);

		const startedAt = new Date();
		const running = await guardedTransition(
			prisma,
			"run-1",
			"dispatched",
			"running",
			{ startedAt },
		);

		assert.equal(running?.status, "running");
		assert.equal(running?.startedAt, startedAt);
	});

	it("running -> success transition succeeds", async () => {
		const { prisma } = createFakePrisma([
			{ id: "run-1", status: "running", draftValue: "build it" },
		]);

		const completedAt = new Date();
		const success = await guardedTransition(
			prisma,
			"run-1",
			"running",
			"success",
			{ completedAt },
		);

		assert.equal(success?.status, "success");
		assert.equal(success?.completedAt, completedAt);
	});

	it("running -> failed transition succeeds", async () => {
		const { prisma } = createFakePrisma([
			{ id: "run-1", status: "running", draftValue: "build it" },
		]);

		const completedAt = new Date();
		const failed = await guardedTransition(
			prisma,
			"run-1",
			"running",
			"failed",
			{ completedAt, errorSummary: "sandbox failed" },
		);

		assert.equal(failed?.status, "failed");
		assert.equal(failed?.completedAt, completedAt);
		assert.equal(failed?.errorSummary, "sandbox failed");
	});

	it("duplicate dispatched -> running is blocked", async () => {
		const { prisma } = createFakePrisma([
			{ id: "run-1", status: "dispatched", draftValue: "build it" },
		]);

		const first = await transition(prisma, "run-1", "dispatched", "running");
		const second = await transition(prisma, "run-1", "dispatched", "running");

		assert.equal(first?.status, "running");
		assert.equal(second, null);
	});

	it("isTerminal returns true only for completed runs", () => {
		assert.equal(isTerminal("success"), true);
		assert.equal(isTerminal("failed"), true);
		assert.equal(isTerminal("dispatched"), false);
		assert.equal(isTerminal("running"), false);
	});

	it("exposes only immediate dispatch lifecycle transitions", () => {
		assert.deepEqual(STATE_TRANSITIONS, {
			dispatched: ["running"],
			running: ["success", "failed"],
			success: [],
			failed: [],
		});
	});
});
