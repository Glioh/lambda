import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { RunStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/db";
import { routingRouter } from "../server/procedures";

type RunRow = {
	id: string;
	status: RunStatus;
	draftValue: string;
	projectId: string;
	messageId: string | null;
	retriedFromRunId: string | null;
	project: {
		userId: string;
	};
};

const originalPrisma = {
	runFindUnique: prisma.run.findUnique,
	runCreate: prisma.run.create,
	auditCreate: prisma.routingAuditLog.create,
};

afterEach(() => {
	(
		prisma.run as unknown as {
			findUnique: typeof originalPrisma.runFindUnique;
			create: typeof originalPrisma.runCreate;
		}
	).findUnique = originalPrisma.runFindUnique;
	(
		prisma.run as unknown as {
			findUnique: typeof originalPrisma.runFindUnique;
			create: typeof originalPrisma.runCreate;
		}
	).create = originalPrisma.runCreate;
	(
		prisma.routingAuditLog as unknown as {
			create: typeof originalPrisma.auditCreate;
		}
	).create = originalPrisma.auditCreate;
});

function createCaller(rows: RunRow[]) {
	const runs = new Map(rows.map((row) => [row.id, row]));
	const auditLogs: unknown[] = [];

	(
		prisma.run as unknown as {
			findUnique: (args: { where: { id: string } }) => Promise<RunRow | null>;
			create: (args: {
				data: {
					projectId: string;
					draftValue: string;
					messageId: string | null;
					retriedFromRunId: string;
					status: RunStatus;
				};
			}) => Promise<RunRow>;
		}
	).findUnique = async ({ where }) => runs.get(where.id) ?? null;

	(
		prisma.run as unknown as {
			findUnique: (args: { where: { id: string } }) => Promise<RunRow | null>;
			create: (args: {
				data: {
					projectId: string;
					draftValue: string;
					messageId: string | null;
					retriedFromRunId: string;
					status: RunStatus;
				};
			}) => Promise<RunRow>;
		}
	).create = async ({ data }) => {
		const retry: RunRow = {
			id: `retry-${runs.size + 1}`,
			status: data.status,
			draftValue: data.draftValue,
			projectId: data.projectId,
			messageId: data.messageId,
			retriedFromRunId: data.retriedFromRunId,
			project: {
				userId: "user-1",
			},
		};

		runs.set(retry.id, retry);
		return retry;
	};

	(
		prisma.routingAuditLog as unknown as {
			create: (args: { data: unknown }) => Promise<unknown>;
		}
	).create = async ({ data }) => {
		auditLogs.push(data);
		return data;
	};

	return {
		auditLogs,
		caller: routingRouter.createCaller({
			auth: {
				userId: "user-1",
			},
		} as never),
	};
}

function createRun(status: RunStatus): RunRow {
	return {
		id: `run-${status}`,
		status,
		draftValue: "build it",
		projectId: "project-1",
		messageId: "message-1",
		retriedFromRunId: null,
		project: {
			userId: "user-1",
		},
	};
}

describe("retryRun", () => {
	it("creates a new run with correct retry lineage", async () => {
		const original = createRun("failed");
		const { auditLogs, caller } = createCaller([original]);

		const retry = await caller.retryRun({ runId: original.id });

		assert.equal(retry.projectId, original.projectId);
		assert.equal(retry.draftValue, original.draftValue);
		assert.equal(retry.messageId, original.messageId);
		assert.equal(retry.retriedFromRunId, original.id);
		assert.equal(auditLogs.length, 1);
		assert.deepEqual(auditLogs[0], {
			runId: retry.id,
			action: "retry",
			actor: "user-1",
			payload: {
				retriedFromRunId: original.id,
			},
		});
	});

	it("rejects non-terminal runs", async () => {
		const statuses: RunStatus[] = [
			"running",
			"confirmed",
			"dispatched",
			"waiting_confirmation",
		];

		for (const status of statuses) {
			const original = createRun(status);
			const { caller } = createCaller([original]);

			await assert.rejects(
				() => caller.retryRun({ runId: original.id }),
				(error: unknown) =>
					error instanceof TRPCError && error.code === "BAD_REQUEST",
			);
		}
	});

	it("starts the new run at waiting_confirmation", async () => {
		const original = createRun("cancelled");
		const { caller } = createCaller([original]);

		const retry = await caller.retryRun({ runId: original.id });

		assert.equal(retry.status, "waiting_confirmation");
	});
});
