import { prisma } from "@/lib/db";
import {
	protectedProcedure,
	createTRPCRouter,
	usageProtectedProcedure,
} from "@/trpc/init";
import { decideRoute, routingInputSchema } from "@/modules/routing";
import { createAndDispatchBuildRun } from "@/modules/routing/server/dispatch";
import { TRPCError } from "@trpc/server";
import z from "zod";

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
					runs: {
						select: {
							id: true,
							status: true,
							createdAt: true,
						},
						orderBy: { createdAt: "desc" },
					},
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
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const existingProject = await prisma.project.findUnique({
				where: {
					id: input.projectId,
					userId: ctx.auth.userId,
				},
			});

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

			const [artifactVersionCount, buildRunCount] = await Promise.all([
				prisma.artifactVersion.count({
					where: { artifact: { projectId: existingProject.id } },
				}),
				prisma.run.count({
					where: {
						projectId: existingProject.id,
						status: { in: ["dispatched", "running"] },
					},
				}),
			]);

			const decision = decideRoute({
				value: input.value,
				routing: input.routing,
				projectId: existingProject.id,
				hasPriorBuild: artifactVersionCount > 0 || buildRunCount > 0,
			});

			if (decision.decision === "chat") {
				// TODO(P5-2): split chat budget — credits currently consumed via usageProtectedProcedure even on chat path
				return { ...newMessage, routing: decision, runId: null };
			}

			const run = await createAndDispatchBuildRun({
				projectId: existingProject.id,
				messageId: newMessage.id,
				value: input.value,
				actor: ctx.auth.userId,
				decision,
			});

			return { ...newMessage, routing: decision, runId: run.id };
		}),
});
