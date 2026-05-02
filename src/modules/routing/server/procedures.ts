import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { logAuditEvent } from "../audit";
import { transition } from "../state";

const pendingRunInput = z.object({
	pendingRunId: z.string().min(1, { message: "Pending run ID is required." }),
});

/**
 * Retrieves a pending run and verifies ownership by the given user.
 * @param {string} pendingRunId - The ID of the pending run to fetch.
 * @param {string} userId - The ID of the user requesting the pending run.
 * @returns {Promise<PendingRun>} The pending run with project details included.
 * @throws {TRPCError} NOT_FOUND if pending run doesn't exist, FORBIDDEN if user doesn't own it.
 */
async function getOwnedPendingRun(pendingRunId: string, userId: string) {
	// Helper function to get a pending run and check if it belongs to the user
	const pendingRun = await prisma.pendingRun.findUnique({
		where: {
			id: pendingRunId,
		},
		include: {
			project: true,
		},
	});

	if (!pendingRun) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Pending run not found.",
		});
	}

	if (pendingRun.project.userId !== userId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You do not have access to this pending run.",
		});
	}

	return pendingRun;
}

/**
 * Confirms a pending run and dispatches it to the code agent.
 * Transitions the run from waiting_confirmation → confirmed → dispatched.
 * Handles conflicts via retry mechanism and logs audit events.
 * @param {string} pendingRunId - The ID of the pending run to confirm.
 * @param {string} userId - The ID of the user confirming the run.
 * @param {string} [draftValue] - Optional draft value to update before confirming.
 * @param {boolean} [retried=false] - Internal retry flag to prevent infinite loops.
 * @returns {Promise<PendingRun>} The dispatched pending run.
 * @throws {TRPCError} If run is cancelled or already dispatched.
 */
async function confirmPendingRun(
	pendingRunId: string,
	userId: string,
	draftValue?: string,
	retried = false,
) {
	let pendingRun = await getOwnedPendingRun(pendingRunId, userId);

	if (pendingRun.status === "dispatched") {
		return pendingRun;
	}

	if (pendingRun.status === "cancelled") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "run already cancelled",
		});
	}

	if (pendingRun.status === "waiting_confirmation") {
		const updated = await transition(
			// Tries to transition the pending run to the confirmed state if its still waiting otherwise that means it was modified
			prisma,
			pendingRun.id,
			"waiting_confirmation",
			"confirmed",
			{
				...(draftValue === undefined ? {} : { draftValue }),
			},
		);

		if (!updated) {
			if (retried) {
				// If we already tried that means pending run was modified in between and stop to avoid infinite loop
				throw new TRPCError({
					code: "CONFLICT",
					message: "Pending run changed while confirming.",
				});
			}

			return confirmPendingRun(pendingRunId, userId, draftValue, true); // Tries it again
		}

		pendingRun = {
			// Append the projectId to the pendingRun for the audit log
			...pendingRun,
			...updated,
		};

		await logAuditEvent(prisma, {
			pendingRunId: pendingRun.id,
			action: "confirm",
			actor: userId,
			payload: draftValue === undefined ? undefined : { draftValue },
		});
	}

	await inngest.send({
		name: "code-agent/run",
		data: {
			value: pendingRun.draftValue,
			projectId: pendingRun.projectId,
			pendingRunId: pendingRun.id,
		},
	});

	const dispatchedRun = await transition(
		prisma,
		pendingRun.id,
		"confirmed",
		"dispatched",
		{
			dispatchedAt: new Date(),
		},
	); // Tries to transition the pending run to dispatched, if it fails that means it was modified and we can return the current state without dispatching or logging again since it should be already dispatched

	if (!dispatchedRun) {
		return getOwnedPendingRun(pendingRun.id, userId);
	}

	await logAuditEvent(prisma, {
		pendingRunId: dispatchedRun.id,
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
	 * Mutation to confirm a pending run and dispatch it to the code agent.
	 * Orchestrates the full confirmation and dispatch workflow.
	 */
	confirmRun: protectedProcedure // confirm endpoint and try to dispatch
		.input(
			pendingRunInput.extend({
				draftValue: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			return confirmPendingRun(
				input.pendingRunId,
				ctx.auth.userId,
				input.draftValue,
			);
		}),

	/**
	 * Mutation to cancel a pending run.
	 * Prevents cancellation of runs that are already dispatched or confirmed.
	 */
	cancelRun: protectedProcedure
		.input(pendingRunInput)
		.mutation(async ({ input, ctx }) => {
			const pendingRun = await getOwnedPendingRun(
				input.pendingRunId,
				ctx.auth.userId,
			);

			if (pendingRun.status === "cancelled") {
				return pendingRun;
			}

			if (pendingRun.status === "dispatched") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "run already dispatched",
				});
			}

			if (pendingRun.status === "confirmed") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "run already confirmed; cannot cancel",
				});
			}

			const cancelledRun = await transition(
				prisma,
				pendingRun.id,
				pendingRun.status,
				"cancelled",
				{
					cancelledAt: new Date(),
				},
			);

			if (!cancelledRun) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Pending run changed while cancelling.",
				});
			}

			await logAuditEvent(prisma, {
				pendingRunId: cancelledRun.id,
				action: "cancel",
				actor: ctx.auth.userId,
				payload: {
					previousStatus: pendingRun.status,
				},
			});

			return cancelledRun;
		}),
});
