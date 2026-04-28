import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import {
	protectedProcedure,
	createTRPCRouter,
	usageProtectedProcedure,
} from "@/trpc/init";
import { routingInputSchema } from "@/modules/routing";
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

			await inngest.send({
				name: "code-agent/run",
				data: {
					value: input.value,
					projectId: existingProject.id,
				},
			});

			return newMessage;
		}),
});
