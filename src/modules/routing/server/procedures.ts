import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { logAuditEvent } from "../audit";
import { transition } from "../state";

const runInput = z.object({
	runId: z.string().min(1, { message: "Run ID is required." }),
});

/**
 * Retrieves a run and verifies ownership by the given user.
 * @param {string} runId - The ID of the run to fetch.
 * @param {string} userId - The ID of the user requesting the run.
 * @returns {Promise<Run>} The run with project details included.
 * @throws {TRPCError} NOT_FOUND if run doesn't exist, FORBIDDEN if user doesn't own it.
 */
async function getOwnedRun(runId: string, userId: string) {
	// Helper function to get a run and check if it belongs to the user
	const run = await prisma.run.findUnique({
		where: {
			id: runId,
		},
		include: {
			project: true,
		},
	});

	if (!run) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Run not found.",
		});
	}

	if (run.project.userId !== userId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You do not have access to this run.",
		});
	}

	return run;
}

/**
 * Confirms a run and dispatches it to the code agent.
 * Transitions the run from waiting_confirmation → confirmed → dispatched.
 * Handles conflicts via retry mechanism and logs audit events.
 * @param {string} runId - The ID of the run to confirm.
 * @param {string} userId - The ID of the user confirming the run.
 * @param {string} [draftValue] - Optional draft value to update before confirming.
 * @param {boolean} [retried=false] - Internal retry flag to prevent infinite loops.
 * @returns {Promise<Run>} The dispatched run.
 * @throws {TRPCError} If run is cancelled or already dispatched.
 */
async function confirmRun(
	runId: string,
	userId: string,
	draftValue?: string,
	retried = false,
) {
	let run = await getOwnedRun(runId, userId);

	if (run.status === "dispatched") {
		return run;
	}

	if (run.status === "cancelled") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "run already cancelled",
		});
	}

	if (run.status === "waiting_confirmation") {
		const updated = await transition(
			// Tries to transition the run to the confirmed state if its still waiting otherwise that means it was modified
			prisma,
			run.id,
			"waiting_confirmation",
			"confirmed",
			{
				...(draftValue === undefined ? {} : { draftValue }),
			},
		);

		if (!updated) {
			if (retried) {
				// If we already tried that means run was modified in between and stop to avoid infinite loop
				throw new TRPCError({
					code: "CONFLICT",
					message: "Run changed while confirming.",
				});
			}

			return confirmRun(runId, userId, draftValue, true); // Tries it again
		}

		run = {
			// Append the projectId to the run for the audit log
			...run,
			...updated,
		};

		await logAuditEvent(prisma, {
			runId: run.id,
			action: "confirm",
			actor: userId,
			payload: draftValue === undefined ? undefined : { draftValue },
		});
	}

	await inngest.send({
		name: "code-agent/run",
		data: {
			value: run.draftValue,
			projectId: run.projectId,
			runId: run.id,
		},
	});

	const dispatchedRun = await transition(
		prisma,
		run.id,
		"confirmed",
		"dispatched",
		{
			dispatchedAt: new Date(),
		},
	); // Tries to transition the run to dispatched, if it fails that means it was modified and we can return the current state without dispatching or logging again since it should be already dispatched

	if (!dispatchedRun) {
		return getOwnedRun(run.id, userId);
	}

	await logAuditEvent(prisma, {
		runId: dispatchedRun.id,
		action: "dispatch",
		actor: userId,
		payload: {
			projectId: dispatchedRun.projectId,
		},
	});

	return dispatchedRun;
}

export const routingRouter = createTRPCRouter({
	/**
	 * Mutation to confirm a run and dispatch it to the code agent.
	 * Orchestrates the full confirmation and dispatch workflow.
	 */
	confirmRun: protectedProcedure // confirm endpoint and try to dispatch
		.input(
			runInput.extend({
				draftValue: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			return confirmRun(
				input.runId,
				ctx.auth.userId,
				input.draftValue,
			);
		}),

	/**
	 * Mutation to cancel a run.
	 * Prevents cancellation of runs that are already dispatched or confirmed.
	 */
	cancelRun: protectedProcedure
		.input(runInput)
		.mutation(async ({ input, ctx }) => {
			const run = await getOwnedRun(
				input.runId,
				ctx.auth.userId,
			);

			if (run.status === "cancelled") {
				return run;
			}

			if (run.status === "dispatched") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "run already dispatched",
				});
			}

			if (run.status === "running") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "run already running; cannot cancel",
				});
			}

			if (run.status === "success" || run.status === "failed") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "run already completed; cannot cancel",
				});
			}

			if (run.status === "confirmed") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "run already confirmed; cannot cancel",
				});
			}

			const cancelledRun = await transition(
				prisma,
				run.id,
				run.status,
				"cancelled",
				{
					cancelledAt: new Date(),
				},
			);

			if (!cancelledRun) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Run changed while cancelling.",
				});
			}

			await logAuditEvent(prisma, {
				runId: cancelledRun.id,
				action: "cancel",
				actor: ctx.auth.userId,
				payload: {
					previousStatus: run.status,
				},
			});

			return cancelledRun;
		}),
});
