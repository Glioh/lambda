import { prisma } from "@/lib/db";
import {
	protectedProcedure,
	createTRPCRouter,
	usageProtectedProcedure,
} from "@/trpc/init";
import { decideRoute, routingInputSchema } from "@/modules/routing";
import { logAuditEvent } from "@/modules/routing/audit";
import { TRPCError } from "@trpc/server";
import z from "zod";

const logLatency = (
	traceId: string | undefined,
	step: string,
	startTime: number,
	details?: Record<string, unknown>,
) => {
	console.log("[chat-latency]", {
		traceId: traceId ?? "unknown",
		step,
		elapsedMs: Date.now() - startTime,
		...details,
	});
};

export const messagesRouter = createTRPCRouter({
	getMany: protectedProcedure
		.input(
			z.object({
				projectId: z.string().min(1, { message: "Project ID is required." }),
			}),
		)
		.query(async ({ input, ctx }) => {
			const messages = await prisma.message.findMany({
				where: {
					projectId: input.projectId,
					project: {
						userId: ctx.auth.userId,
					},
				},
				include: {
					fragment: true,
				},
				orderBy: {
					updatedAt: "asc",
				},
			});
			return messages;
		}),

	create: usageProtectedProcedure
		.input(
			z.object({
				value: z
					.string()
					.min(1, { message: "Message cannot be empty." })
					.max(10000, "Prompt is too long"),
				projectId: z.string().min(1, { message: "Project ID is required." }),
				routing: routingInputSchema,
				debugTraceId: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const startTime = Date.now();
			logLatency(input.debugTraceId, "messages.create.start", startTime, {
				projectId: input.projectId,
			});

			const existingProject = await prisma.project.findUnique({
				where: {
					id: input.projectId,
					userId: ctx.auth.userId,
				},
			});

			logLatency(
				input.debugTraceId,
				"messages.create.projectLookup.end",
				startTime,
				{ found: !!existingProject },
			);

			if (!existingProject) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found.",
				});
			}

			const newMessage = await prisma.message.create({
				data: {
					projectId: existingProject.id,
					content: input.value,
					role: "USER",
					type: "RESULT",
				},
			});

			logLatency(input.debugTraceId, "messages.create.messageInsert.end", startTime, {
				messageId: newMessage.id,
			});

			const decision = decideRoute({
				value: input.value,
				routing: input.routing,
				projectId: existingProject.id,
			});

			logLatency(input.debugTraceId, "messages.create.routing.end", startTime, {
				decision: decision.decision,
				decisionSource: decision.decisionSource,
			});

			if (decision.decision === "chat") {
				// TODO(P5-2): split chat budget — credits currently consumed via usageProtectedProcedure even on chat path
				logLatency(input.debugTraceId, "messages.create.complete", startTime, {
					decision: decision.decision,
				});
				return { ...newMessage, routing: decision, pendingRunId: null };
			}

			const pendingRun = await prisma.pendingRun.create({
				data: {
					status: "waiting_confirmation",
					draftValue: input.value,
					projectId: existingProject.id,
					messageId: newMessage.id,
				},
			});

			logLatency(
				input.debugTraceId,
				"messages.create.pendingRunInsert.end",
				startTime,
				{ pendingRunId: pendingRun.id },
			);

			await logAuditEvent(prisma, {
				pendingRunId: pendingRun.id,
				action: "create",
				actor: ctx.auth.userId,
				payload: { decision },
			});

			logLatency(input.debugTraceId, "messages.create.auditLog.end", startTime, {
				pendingRunId: pendingRun.id,
			});
			logLatency(input.debugTraceId, "messages.create.complete", startTime, {
				decision: decision.decision,
			});

			return { ...newMessage, routing: decision, pendingRunId: pendingRun.id };
		}),
});
