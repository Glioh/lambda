import { prisma } from "@/lib/db";
import { generateSlug } from "random-word-slugs";
import {
	protectedProcedure,
	createTRPCRouter,
	usageProtectedProcedure,
} from "@/trpc/init";
import z from "zod";
import { TRPCError } from "@trpc/server";
import { generateChatTitle } from "./title";
import {
	ACCEPTED_IMAGE_TYPES,
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_BASE64_CHARS,
} from "@/modules/attachments/constants";
import {
	AttachmentValidationError,
	validateAttachments,
} from "@/modules/attachments/lib/validate";

/** Shape check only — sizes and file signatures are verified in validateAttachments. */
const attachmentInputSchema = z.object({
	mimeType: z.enum(ACCEPTED_IMAGE_TYPES),
	data: z.string().min(1).max(MAX_BASE64_CHARS, "Image is too large."),
	width: z.int().positive(),
	height: z.int().positive(),
});

/** tRPC router for authenticated project and chat-management operations. */
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
			take: 200,
			// Explicit select: never ship userId to the client, and never risk a
			// future schema change pulling messages into the sidebar payload.
			select: {
				id: true,
				name: true,
				createdAt: true,
				updatedAt: true,
			},
		});
		return projects;
	}),

	rename: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1, { message: "Id is required." }),
				name: z
					.string()
					.trim()
					.min(1, { message: "Name cannot be empty." })
					.max(100, { message: "Name is too long." }),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// updateMany makes the ownership check part of the UPDATE itself, so
			// there is no read-then-write window where the row could change hands.
			const { count } = await prisma.project.updateMany({
				where: {
					id: input.id,
					userId: ctx.auth.userId,
				},
				data: {
					name: input.name,
					// Stamping this is what stops the LLM titler from later
					// overwriting a name the user chose deliberately.
					titleGeneratedAt: new Date(),
				},
			});

			if (count === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found.",
				});
			}

			return { id: input.id, name: input.name };
		}),

	// Deliberately NOT usageProtected: a title is an internal nicety, and
	// charging a credit for one the user never asked for would be wrong.
	generateTitle: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1, { message: "Id is required." }),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Claim the one allowed title-generation attempt before calling the model.
			// updateMany makes the null check atomic, so concurrent callers cannot both
			// spend an API request generating a title for the same chat.
			const claimedAt = new Date();
			const { count: claimedCount } = await prisma.project.updateMany({
				where: {
					id: input.id,
					userId: ctx.auth.userId,
					titleGeneratedAt: null,
				},
				data: { titleGeneratedAt: claimedAt },
			});

			if (claimedCount === 0) {
				return null;
			}

			const source = await prisma.message.findMany({
				where: { projectId: input.id, type: { not: "SUMMARY" } },
				orderBy: { createdAt: "asc" },
				take: 2,
				select: {
					role: true,
					content: true,
					attachments: { select: { id: true }, take: 1 },
				},
			});

			if (source.length === 0) {
				return null;
			}

			const title = await generateChatTitle(
				source.map((message) => ({
					role: message.role,
					content: message.content,
					hasImage: message.attachments.length > 0,
				})),
			);

			if (!title) {
				return null;
			}

			// Match this claim's timestamp rather than null. A manual rename stamps a
			// newer value, so it still wins if it lands while the model is thinking.
			const { count } = await prisma.project.updateMany({
				where: {
					id: input.id,
					userId: ctx.auth.userId,
					titleGeneratedAt: claimedAt,
				},
				data: { name: title },
			});

			return count > 0 ? { id: input.id, name: title } : null;
		}),

	// Named `remove` rather than `delete`: the latter is a reserved word and
	// reads badly through the tRPC proxy (`trpc.projects.delete.mutationOptions`).
	remove: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1, { message: "Id is required." }),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Messages and their attachments cascade via the foreign keys.
			const { count } = await prisma.project.deleteMany({
				where: {
					id: input.id,
					userId: ctx.auth.userId,
				},
			});

			if (count === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found.",
				});
			}

			return { id: input.id };
		}),

	create: usageProtectedProcedure
		.input(
			z
				.object({
					value: z.string().max(10000, "Prompt is too long"),
					attachments: z
						.array(attachmentInputSchema)
						.max(MAX_ATTACHMENTS_PER_MESSAGE)
						.optional(),
				})
				// An image on its own is enough to open a chat.
				.refine(
					(input) =>
						input.value.trim().length > 0 ||
						(input.attachments?.length ?? 0) > 0,
					{ message: "Message cannot be empty.", path: ["value"] },
				),
		)
		.mutation(async ({ input, ctx }) => {
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

			return prisma.project.create({
				data: {
					userId: ctx.auth.userId,
					// Placeholder until the LLM titler runs after the first exchange.
					// A distinguishable slug makes a failed titling visible rather
					// than silently indistinguishable from an untitled chat.
					name: generateSlug(2, {
						format: "kebab",
					}),
					messages: {
						create: {
							content: input.value,
							role: "USER",
							type: "RESULT",
							...(attachments.length > 0
								? { attachments: { create: attachments } }
								: {}),
						},
					},
				},
				include: {
					messages: true,
				},
			});
		}),
});
