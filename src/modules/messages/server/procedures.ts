import { prisma } from "@/lib/db";
import {
	protectedProcedure,
	createTRPCRouter,
	usageProtectedProcedure,
} from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import {
	ACCEPTED_IMAGE_TYPES,
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_BASE64_CHARS,
} from "@/modules/attachments/constants";
import {
	AttachmentValidationError,
	validateAttachments,
} from "@/modules/attachments/lib/validate";
import {
	ROLLBACK_EDGE_BY_ROLE,
	rollbackScope,
} from "@/modules/messages/lib/rollback";

/**
 * Loads a project the caller owns, or throws NOT_FOUND.
 * @param {string} projectId - The project to load.
 * @param {string} userId - The authenticated user id.
 * @returns {Promise<{ id: string }>} The owned project.
 * @throws {TRPCError} NOT_FOUND when it doesn't exist or isn't theirs.
 */
async function requireProject(projectId: string, userId: string) {
	const project = await prisma.project.findUnique({
		where: { id: projectId, userId },
		select: { id: true },
	});

	if (!project) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
	}

	return project;
}

/** Shape check only — sizes and file signatures are verified in validateAttachments. */
const attachmentInputSchema = z.object({
	mimeType: z.enum(ACCEPTED_IMAGE_TYPES),
	data: z.string().min(1).max(MAX_BASE64_CHARS, "Image is too large."),
	width: z.int().positive(),
	height: z.int().positive(),
});

/**
 * tRPC router for authenticated message operations within a project.
 *
 * Exposes procedures for reading, creating, editing, and retrying messages.
 * Mounted by the application router under the `messages` namespace.
 */
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
				// createdAt, not updatedAt: compaction backdates createdAt on SUMMARY
				// rows so the checkpoint divider renders at the fold rather than at the
				// end of the chat. On the exact tie, MessageType's declaration order
				// (RESULT, ERROR, SUMMARY) sorts the checkpoint after the last folded
				// message, which is where it belongs.
				orderBy: [{ createdAt: "asc" }, { type: "asc" }],
				select: {
					id: true,
					content: true,
					role: true,
					type: true,
					createdAt: true,
					updatedAt: true,
					// Metadata only. The base64 payload is served by
					// /api/attachments/[attachmentId] so it never rides this response,
					// which is re-fetched on a poll while a response streams.
					attachments: {
						select: {
							id: true,
							mimeType: true,
							width: true,
							height: true,
						},
						orderBy: { createdAt: "asc" },
					},
				},
			});
			return messages;
		}),

	create: usageProtectedProcedure
		.input(
			z
				.object({
					value: z.string().max(10000, "Prompt is too long"),
					projectId: z.string().min(1, { message: "Project ID is required." }),
					attachments: z
						.array(attachmentInputSchema)
						.max(MAX_ATTACHMENTS_PER_MESSAGE)
						.optional(),
				})
				// An image on its own is a complete message, so text is only required
				// when nothing is attached.
				.refine(
					(input) =>
						input.value.trim().length > 0 ||
						(input.attachments?.length ?? 0) > 0,
					{ message: "Message cannot be empty.", path: ["value"] },
				),
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

			// Never trust the client's word on type or size: the stored mimeType is
			// echoed as a Content-Type when the image is served back.
			let attachments;

			try {
				attachments = validateAttachments(input.attachments ?? []);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof AttachmentValidationError
							? error.message
							: "Attachments are invalid.",
				});
			}

			const [message] = await prisma.$transaction([
				prisma.message.create({
					data: {
						projectId: existingProject.id,
						content: input.value,
						role: "USER",
						type: "RESULT",
						...(attachments.length > 0
							? { attachments: { create: attachments } }
							: {}),
					},
				}),
				// @updatedAt only fires when the Project row itself is written, so
				// without this bump the sidebar (ordered by updatedAt desc) would be
				// ordered by project creation time instead of last activity.
				prisma.project.update({
					where: { id: existingProject.id },
					data: { updatedAt: new Date() },
				}),
			]);

			return message;
		}),

	/**
	 * Rewrites a user turn and rolls the chat back to it.
	 *
	 * Everything after the edited message is deleted, including SUMMARY rows.
	 * That is deliberate and differs from {@link retryFrom}: a checkpoint dated
	 * after the edit point folded messages that no longer exist, so keeping it
	 * would replay a summary of a chat that never happened. Dropping it
	 * simply promotes the previous checkpoint, whose folded messages are all
	 * still valid history.
	 */
	editAndResend: usageProtectedProcedure
		.input(
			z.object({
				projectId: z.string().min(1, { message: "Project ID is required." }),
				messageId: z.string().min(1, { message: "Message ID is required." }),
				value: z.string().trim().max(10000, "Prompt is too long"),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const existingProject = await requireProject(
				input.projectId,
				ctx.auth.userId,
			);

			return prisma.$transaction(async (tx) => {
				const target = await tx.message.findFirst({
					where: { id: input.messageId, projectId: existingProject.id },
					select: {
						id: true,
						role: true,
						createdAt: true,
						attachments: { select: { id: true }, take: 1 },
					},
				});

				if (!target || target.role !== "USER") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Only your own messages can be edited.",
					});
				}

				const hasAttachments = target.attachments.length > 0;

				// Text may only be emptied when images carry the message on their own.
				if (!input.value && !hasAttachments) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Message cannot be empty.",
					});
				}

				await tx.message.update({
					where: { id: target.id },
					data: { content: input.value },
				});

				await tx.message.deleteMany({
					where: {
						projectId: existingProject.id,
						...rollbackScope(target.createdAt, "after"),
					},
				});

				await tx.project.update({
					where: { id: existingProject.id },
					data: { updatedAt: new Date() },
				});

				return { value: input.value, hasAttachments };
			});
		}),

	/**
	 * Rolls the chat back to a message and hands back the prompt to re-run.
	 *
	 * Anchored on an answer, that answer is replaced. Anchored on your own
	 * message, that message is kept and re-sent unchanged. Works anywhere in the
	 * chat, and on ERROR rows — which are otherwise dead ends the user can only
	 * escape by retyping.
	 */
	retryFrom: usageProtectedProcedure
		.input(
			z.object({
				projectId: z.string().min(1, { message: "Project ID is required." }),
				messageId: z.string().min(1, { message: "Message ID is required." }),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const existingProject = await requireProject(
				input.projectId,
				ctx.auth.userId,
			);

			return prisma.$transaction(async (tx) => {
				const target = await tx.message.findFirst({
					where: { id: input.messageId, projectId: existingProject.id },
					select: {
						id: true,
						role: true,
						type: true,
						createdAt: true,
						// Selected up front so retrying your own message can reuse this
						// row instead of re-reading it below.
						content: true,
						attachments: { select: { id: true }, take: 1 },
					},
				});

				if (!target) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Message not found.",
					});
				}

				if (target.type === "SUMMARY") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Compaction checkpoints can't be retried.",
					});
				}

				// Retrying an answer re-runs the prompt behind it; retrying your own
				// message re-runs that message. Either way the chat is rolled back
				// so the prompt is last, and the client streams a fresh response.
				const prompt =
					target.role === "USER"
						? target
						: await tx.message.findFirst({
								where: {
									projectId: existingProject.id,
									role: "USER",
									createdAt: { lt: target.createdAt },
								},
								orderBy: { createdAt: "desc" },
								select: {
									content: true,
									attachments: { select: { id: true }, take: 1 },
								},
							});

				if (!prompt) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Nothing to retry.",
					});
				}

				await tx.message.deleteMany({
					where: {
						projectId: existingProject.id,
						...rollbackScope(
							target.createdAt,
							ROLLBACK_EDGE_BY_ROLE[target.role],
						),
					},
				});

				await tx.project.update({
					where: { id: existingProject.id },
					data: { updatedAt: new Date() },
				});

				return {
					value: prompt.content,
					hasAttachments: prompt.attachments.length > 0,
				};
			});
		}),
});
