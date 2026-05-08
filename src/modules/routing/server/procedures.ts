import { prisma } from "@/lib/db";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";

export const routingRouter = createTRPCRouter({
	getRunsForProject: protectedProcedure
		.input(
			z.object({
				projectId: z.string().min(1, { message: "Project ID is required." }),
			}),
		)
		.query(async ({ input, ctx }) => {
			const project = await prisma.project.findUnique({
				where: { id: input.projectId },
				select: { userId: true },
			});

			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found.",
				});
			}

			if (project.userId !== ctx.auth.userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this project.",
				});
			}

			return prisma.run.findMany({
				where: { projectId: input.projectId },
				include: {
					auditLogs: {
						select: {
							action: true,
							actor: true,
							createdAt: true,
							payload: true,
						},
						orderBy: { createdAt: "asc" },
					},
				},
				orderBy: { createdAt: "desc" },
			});
		}),
});
