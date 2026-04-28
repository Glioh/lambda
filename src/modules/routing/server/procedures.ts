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

async function getOwnedPendingRun(pendingRunId: string, userId: string) {
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
				throw new TRPCError({
					code: "CONFLICT",
					message: "Pending run changed while confirming.",
				});
			}

			return confirmPendingRun(pendingRunId, userId, draftValue, true);
		}

		pendingRun = {
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

	const dispatchedRun = await transition(prisma, pendingRun.id, "confirmed", "dispatched", {
		dispatchedAt: new Date(),
	});

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
	requestClarification: protectedProcedure
		.input(
			pendingRunInput.extend({
				draftValue: z.string().optional(),
				clarificationPrompt: z.string().min(1, {
					message: "Clarification prompt is required.",
				}),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const pendingRun = await getOwnedPendingRun(input.pendingRunId, ctx.auth.userId);
			const patch = {
				...(input.draftValue === undefined
					? {}
					: {
							draftValue: input.draftValue,
						}),
				clarificationPrompt: input.clarificationPrompt,
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

	confirmRun: protectedProcedure
		.input(
			pendingRunInput.extend({
				draftValue: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			return confirmPendingRun(input.pendingRunId, ctx.auth.userId, input.draftValue);
		}),

	cancelRun: protectedProcedure.input(pendingRunInput).mutation(async ({ input, ctx }) => {
		const pendingRun = await getOwnedPendingRun(input.pendingRunId, ctx.auth.userId);

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

		const cancelledRun = await transition(prisma, pendingRun.id, pendingRun.status, "cancelled", {
			cancelledAt: new Date(),
		});

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
