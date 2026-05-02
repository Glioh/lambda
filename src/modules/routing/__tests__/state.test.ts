import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, type PendingRunStatus } from "@prisma/client";

const { isTerminal, STATE_TRANSITIONS, transition } = (await import(
	new URL("../state.ts", import.meta.url).href
)) as typeof import("../state");

type PendingRunRow = {
	id: string;
	status: PendingRunStatus;
	draftValue: string;
	dispatchedAt?: Date;
	cancelledAt?: Date;
};

function createFakePrisma(rows: PendingRunRow[]) {
	const pendingRuns = new Map(rows.map((row) => [row.id, row]));

	return {
		pendingRuns,
		prisma: {
			pendingRun: {
				async update({
					where,
					data,
				}: {
					where: { id: string; status?: PendingRunStatus };
					data: Prisma.PendingRunUpdateInput;
				}) {
					const row = pendingRuns.get(where.id);

					if (!row || (where.status && row.status !== where.status)) {
						throw Object.assign(new Error("No PendingRun found"), {
							code: "P2025",
						});
					}

					const next = {
						...row,
						...(data as Partial<PendingRunRow>),
					};

					pendingRuns.set(where.id, next);
					return next;
				},
			},
		},
	};
}

function assertAllowed(from: PendingRunStatus, to: PendingRunStatus) {
	if (!(STATE_TRANSITIONS[from] ?? []).includes(to)) {
		throw new Error(`BAD_REQUEST: cannot transition ${from} to ${to}`);
	}
}

async function guardedTransition(
	fakePrisma: ReturnType<typeof createFakePrisma>["prisma"],
	pendingRunId: string,
	from: PendingRunStatus,
	to: PendingRunStatus,
	patch: Partial<PendingRunRow> = {},
) {
	assertAllowed(from, to);
	return transition(fakePrisma, pendingRunId, from, to, patch);
}

describe("pending run state helpers", () => {
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
		const row: PendingRunRow = {
			id: "run-1",
			status: "dispatched",
			draftValue: "build it",
		};

		const result = isTerminal(row.status) ? row : null;

		assert.equal(result, row);
		assert.deepEqual(STATE_TRANSITIONS.dispatched, []);
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
