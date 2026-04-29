import { prisma } from "@/lib/db";
import { generateSlug } from "random-word-slugs";
import {
	protectedProcedure,
	createTRPCRouter,
	usageProtectedProcedure,
} from "@/trpc/init";
import { decideRoute, routingInputSchema } from "@/modules/routing";
import { logAuditEvent } from "@/modules/routing/audit";
import z from "zod";
import { TRPCError } from "@trpc/server";

export const projectsRouter = createTRPCRouter({
	getOne: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1, { message: "Id is required." }),
			}),
		)

		.query(async ({ input, ctx }) => {
			const existingProject = await prisma.project.findUnique({
				where: {
					id: input.id,
					userId: ctx.auth.userId,
				},
			});

			if (!existingProject) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found.",
				});
			}
			return existingProject;
		}),

	getMany: protectedProcedure.query(async ({ ctx }) => {
		const projects = await prisma.project.findMany({
			where: {
				userId: ctx.auth.userId,
			},
			orderBy: {
				updatedAt: "desc",
			},
		});
		return projects;
	}),

	create: usageProtectedProcedure
		.input(
			z.object({
				value: z
					.string()
					.min(1, { message: "Message cannot be empty." })
					.max(10000, "Prompt is too long"),
				routing: routingInputSchema,
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const createdProject = await prisma.project.create({
				data: {
					userId: ctx.auth.userId,
					name: generateSlug(2, {
						format: "kebab",
					}),
					messages: {
						create: {
							content: input.value,
							role: "USER",
							type: "RESULT",
						},
					},
				},
				include: {
					messages: true,
				},
			});

			const decision = decideRoute({
				value: input.value,
				routing: input.routing,
				projectId: createdProject.id,
			});

			if (decision.decision === "chat") {
				// TODO(P5-2): split chat budget — credits currently consumed via usageProtectedProcedure even on chat path
				return { ...createdProject, routing: decision, pendingRunId: null };
			}

			// By this point we know the decision is to build so we can create a pending run in our db
			const pendingRun = await prisma.pendingRun.create({
				data: {
					status: "waiting_confirmation",
					draftValue: input.value,
					projectId: createdProject.id,
					messageId: createdProject.messages[0]?.id,
				},
			});

			await logAuditEvent(prisma, {
				pendingRunId: pendingRun.id,
				action: "create",
				actor: ctx.auth.userId,
				payload: { decision },
			});

			return {
				...createdProject,
				routing: decision,
				pendingRunId: pendingRun.id,
			};
		}),
});
