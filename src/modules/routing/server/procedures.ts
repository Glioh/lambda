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
 * @throws {TRPCError} If run is cancelled, already dispatched, or clarification is required.
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

	if (pendingRun.status === "clarification_required") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "clarification required",
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
	 * Mutation to request clarification or edit draft for a pending run.
	 * Allows users to transition from clarification_required → waiting_confirmation,
	 * or update draft while in waiting_confirmation state.
	 */
	requestClarification: protectedProcedure // get clarification endpoint
		.input(
			pendingRunInput.extend({
				draftValue: z.string().optional(),
				clarificationPrompt: z.string().min(1, {
					message: "Clarification prompt is required.",
				}),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const pendingRun = await getOwnedPendingRun(
				input.pendingRunId,
				ctx.auth.userId,
			);
			const patch = {
				...(input.draftValue === undefined // provide user entered clarification as draft value
					? {}
					: {
							draftValue: input.draftValue,
						}),
				clarificationPrompt: input.clarificationPrompt, // the thing the AI is asking for clarification about
			};

			if (pendingRun.status === "clarification_required") {
				const updated = await transition(
					prisma,
					pendingRun.id,
					"clarification_required",
					"waiting_confirmation",
					patch,
				);

				if (!updated) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Pending run changed while requesting clarification.",
					});
				}

				await logAuditEvent(prisma, {
					pendingRunId: updated.id,
					action: "request_clarification",
					actor: ctx.auth.userId,
					payload: patch,
				});

				return updated;
			}

			if (pendingRun.status === "waiting_confirmation") {
				const updated = await prisma.pendingRun.update({
					where: {
						id: pendingRun.id,
					},
					data: patch,
				});

				await logAuditEvent(prisma, {
					pendingRunId: updated.id,
					action: "edit_draft",
					actor: ctx.auth.userId,
					payload: patch,
				});

				return updated;
			}

			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Cannot request clarification for pending run with status ${pendingRun.status}.`,
			});
		}),

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
