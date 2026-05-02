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
	cancelledAt?: Date;
};

function createFakePrisma(rows: RunRow[]) {
	const runs = new Map(rows.map((row) => [row.id, row]));

	return {
		runs,
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

					const next = {
						...row,
						...(data as Partial<RunRow>),
					};

					runs.set(where.id, next);
					return next;
				},
			},
		},
	};
}

function assertAllowed(from: RunStatus, to: RunStatus) {
	if (!(STATE_TRANSITIONS[from] ?? []).includes(to)) {
		throw new Error(`BAD_REQUEST: cannot transition ${from} to ${to}`);
	}
}

async function guardedTransition(
	fakePrisma: ReturnType<typeof createFakePrisma>["prisma"],
	runId: string,
	from: RunStatus,
	to: RunStatus,
	patch: Partial<RunRow> = {},
) {
	assertAllowed(from, to);
	return transition(fakePrisma, runId, from, to, patch);
}

describe("run state helpers", () => {
	it("waiting_confirmation -> confirmed -> dispatched ok", async () => {
		const { prisma } = createFakePrisma([
			{ id: "run-1", status: "waiting_confirmation", draftValue: "build it" },
		]);

		const confirmed = await guardedTransition(
			prisma,
			"run-1",
			"waiting_confirmation",
			"confirmed",
		);
		assert.equal(confirmed?.status, "confirmed");

		const dispatchedAt = new Date();
		const dispatched = await guardedTransition(prisma, "run-1", "confirmed", "dispatched", {
			dispatchedAt,
		});

		assert.equal(dispatched?.status, "dispatched");
		assert.equal(dispatched?.dispatchedAt, dispatchedAt);
	});

	it("confirmRun on dispatched is idempotent (no-op)", () => {
		const row: RunRow = {
			id: "run-1",
			status: "dispatched",
			draftValue: "build it",
		};

		const result = isTerminal(row.status) ? row : null;

		assert.equal(result, null);
		assert.deepEqual(STATE_TRANSITIONS.dispatched, ["running"]);
	});

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

	it("isTerminal returns true only for completed and cancelled runs", () => {
		assert.equal(isTerminal("success"), true);
		assert.equal(isTerminal("failed"), true);
		assert.equal(isTerminal("cancelled"), true);
		assert.equal(isTerminal("dispatched"), false);
	});

	it("duplicate dispatched -> running is blocked", async () => {
		const { prisma } = createFakePrisma([
			{ id: "run-1", status: "dispatched", draftValue: "build it" },
		]);

		const first = await guardedTransition(
			prisma,
			"run-1",
			"dispatched",
			"running",
			{ startedAt: new Date() },
		);
		const second = await transition(
			prisma,
			"run-1",
			"dispatched",
			"running",
			{ startedAt: new Date() },
		);

		assert.equal(first?.status, "running");
		assert.equal(second, null);
	});

	it("cancelRun on confirmed is rejected (BAD_REQUEST)", () => {
		assert.throws(() => assertAllowed("confirmed", "cancelled"), /BAD_REQUEST/);
	});

	it("cancelRun on waiting_confirmation succeeds", async () => {
		const { prisma } = createFakePrisma([
			{ id: "run-1", status: "waiting_confirmation", draftValue: "build it" },
		]);

		const cancelledAt = new Date();
		const cancelled = await guardedTransition(
			prisma,
			"run-1",
			"waiting_confirmation",
			"cancelled",
			{ cancelledAt },
		);

		assert.equal(cancelled?.status, "cancelled");
		assert.equal(cancelled?.cancelledAt, cancelledAt);
	});

	it("concurrent confirm + cancel only lets one stale status update win", async () => {
		const { prisma } = createFakePrisma([
			{ id: "run-1", status: "waiting_confirmation", draftValue: "build it" },
		]);

		const confirmed = await transition(
			prisma,
			"run-1",
			"waiting_confirmation",
			"confirmed",
		);
		const cancelled = await transition(
			prisma,
			"run-1",
			"waiting_confirmation",
			"cancelled",
		);

		assert.equal(confirmed?.status, "confirmed");
		assert.equal(cancelled, null);
	});

});
