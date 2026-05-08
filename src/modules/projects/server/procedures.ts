import { prisma } from "@/lib/db";
import { generateSlug } from "random-word-slugs";
import {
	protectedProcedure,
	createTRPCRouter,
	usageProtectedProcedure,
} from "@/trpc/init";
import { decideRoute, routingInputSchema } from "@/modules/routing";
import { createAndDispatchBuildRun } from "@/modules/routing/server/dispatch";
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
				return { ...createdProject, routing: decision, runId: null };
			}

			const run = await createAndDispatchBuildRun({
				projectId: createdProject.id,
				messageId: createdProject.messages[0]?.id,
				value: input.value,
				actor: ctx.auth.userId,
				decision,
			});

			return {
				...createdProject,
				routing: decision,
				runId: run.id,
			};
		}),
});
