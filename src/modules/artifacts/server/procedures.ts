// External dependencies
import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";

// Local service helpers
import {
	getArtifactVersionByNumber,
	getLatestArtifactVersion,
	listArtifactVersions,
} from "./service";

const projectArtifactInput = z.object({
	projectId: z.string().min(1, { message: "Project ID is required." }),
});

/**
 * Ensures the current user owns the requested project.
 * @param {string} projectId - The project ID to validate.
 * @param {string} userId - The ID of the requesting user.
 * @throws {TRPCError} NOT_FOUND if the project does not exist or is not owned by the user.
 */
async function assertOwnedProject(projectId: string, userId: string) {
	const project = await prisma.project.findUnique({
		where: {
			id: projectId,
			userId,
		},
		select: {
			id: true,
		},
	});

	if (!project) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project not found.",
		});
	}
}

/**
 * tRPC router for artifact version retrieval.
 * Exposes protected read operations for artifact versions scoped to a project.
 */
export const artifactsRouter = createTRPCRouter({
	getLatest: protectedProcedure
		.input(projectArtifactInput)
		.query(async ({ input, ctx }) => {
			await assertOwnedProject(input.projectId, ctx.auth.userId);
			return getLatestArtifactVersion(prisma, input.projectId);
		}),

	getMany: protectedProcedure
		.input(projectArtifactInput)
		.query(async ({ input, ctx }) => {
			await assertOwnedProject(input.projectId, ctx.auth.userId);
			return listArtifactVersions(prisma, input.projectId);
		}),

	getOne: protectedProcedure
		.input(
			projectArtifactInput.extend({
				version: z.number().int().positive(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertOwnedProject(input.projectId, ctx.auth.userId);

			const artifactVersion = await getArtifactVersionByNumber(
				prisma,
				input.projectId,
				input.version,
			);

			if (!artifactVersion) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Artifact version not found.",
				});
			}

			return artifactVersion;
		}),
});
