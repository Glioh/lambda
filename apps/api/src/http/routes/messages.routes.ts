import { Type } from "typebox";
import { CreateMessageBodySchema, EditMessageBodySchema, ErrorResponseSchema, MessageParamsSchema, MessageSchema, ProjectIdParamsSchema, RollbackResponseSchema, schemaRef, type RollbackResult, } from "../../contracts/index.js";
import { validateAttachments, AttachmentValidationError } from "../../attachments/validation.js";
import { rollbackScope } from "../../messages/rollback.js";
import { ATTACHMENT_REQUEST_BODY_LIMIT } from "../attachment-limits.js";
import { serializeMessage } from "../serializers.js";
import { getAuthPrincipal } from "../../auth/clerk-auth.js";
import { defaultRouteDependencies, type ApiRouteDependencies } from "./dependencies.js";
import type { ApiFastifyInstance } from "./types.js";

// Define fields to select from database so we dont keep requesting whole message
const messageSelect = {
	id: true,
	content: true,
	role: true,
	type: true,
	createdAt: true,
	updatedAt: true,
	attachments: {
		select: { id: true, mimeType: true, width: true, height: true },
		orderBy: { createdAt: "asc" as const },
	},
} as const;

export function registerMessageRoutes(
	app: ApiFastifyInstance,
	dependencies: ApiRouteDependencies = defaultRouteDependencies,
) {
	const { prisma, chargeCredits } = dependencies;

	app.get(
		"/api/projects/:projectId/messages",
		{
			schema: {
				tags: ["messages"],
				operationId: "listMessages",
				params: ProjectIdParamsSchema,
				response: {
					200: Type.Array(schemaRef(MessageSchema)),
					404: schemaRef(ErrorResponseSchema),
				},
			},
		},
		async (request, reply) => {
			const auth = getAuthPrincipal(request);
			const project = await prisma.project.findFirst({
				where: {
					id: request.params.projectId,
					userId: auth.userId,
				},
				select: { id: true },
			});
			if (!project) {
				return reply.code(404).send({
					statusCode: 404,
					error: "Not Found",
					message: "Project not found.",
				});
			}
			const messages = await prisma.message.findMany({
				where: {
					projectId: project.id,
					project: { userId: auth.userId },
				},
				orderBy: [{ createdAt: "asc" }, { type: "asc" }],
				select: messageSelect,
			});
			return messages.map(serializeMessage);
		},
	);

	app.post(
		"/api/projects/:projectId/messages",
		{
			bodyLimit: ATTACHMENT_REQUEST_BODY_LIMIT,
			schema: {
				tags: ["messages"],
				operationId: "createMessage",
				params: ProjectIdParamsSchema,
				body: CreateMessageBodySchema,
				response: {
					201: schemaRef(MessageSchema),
					400: schemaRef(ErrorResponseSchema),
					404: schemaRef(ErrorResponseSchema),
					413: schemaRef(ErrorResponseSchema),
					429: schemaRef(ErrorResponseSchema),
				},
			},
		},
		async (request, reply) => {
			const auth = getAuthPrincipal(request);

			// Charge credits for the request. If the user has insufficient credits, this will return a 429 response.
			if (!(await chargeCredits(request, auth.userId, reply))) {
				return reply;
			}

			// Validate that the message is not empty. If it is, return a 400 response.
			const project = await prisma.project.findFirst({
				where: { id: request.params.projectId, userId: auth.userId },
				select: { id: true },
			});
			if (!project) {
				return reply.code(404).send({
					statusCode: 404,
					error: "Not Found",
					message: "Project not found.",
				});
			}
			if (!request.body.value.trim() && !request.body.attachments?.length) {
				return reply.code(400).send({
					statusCode: 400,
					error: "Bad Request",
					message: "Message cannot be empty.",
				});
			}

			let attachments;
			try {
				attachments = validateAttachments(request.body.attachments ?? []);
			} catch (error) {
				return reply.code(400).send({
					statusCode: 400,
					error: "Bad Request",
					message:
						error instanceof AttachmentValidationError ? error.message : "Attachments are invalid.",
				});
			}

			const [message] = await prisma.$transaction([
				prisma.message.create({
					data: {
						projectId: project.id,
						content: request.body.value,
						role: "USER",
						type: "RESULT",
						...(attachments.length ? { attachments: { create: attachments } } : {}),
					},
					select: messageSelect,
				}),
				prisma.project.update({
					where: { id: project.id },
					data: { updatedAt: new Date() },
				}),
			]);
			return reply.code(201).send(serializeMessage(message));
		},
	);

	app.post(
		"/api/projects/:projectId/messages/:messageId/edit-and-resend",
		{
			schema: {
				tags: ["messages"],
				operationId: "editAndResendMessage",
				params: MessageParamsSchema,
				body: EditMessageBodySchema,
				response: {
					200: schemaRef(RollbackResponseSchema),
					400: schemaRef(ErrorResponseSchema),
					404: schemaRef(ErrorResponseSchema),
					429: schemaRef(ErrorResponseSchema),
				},
			},
		},
		async (request, reply) => {
			const auth = getAuthPrincipal(request);

			// Charge credits for the request. If the user has insufficient credits, this will return a 429 response.
			if (!(await chargeCredits(request, auth.userId, reply))) {
				return reply;
			}

			// Validate that the message is not empty. If it is, return a 400 response.
			const project = await prisma.project.findFirst({
				where: { id: request.params.projectId, userId: auth.userId },
				select: { id: true },
			});
			if (!project) {
				return reply.code(404).send({
					statusCode: 404,
					error: "Not Found",
					message: "Project not found.",
				});
			}

			const result: RollbackResult = await prisma.$transaction(async tx => {
				const target = await tx.message.findFirst({
					where: { id: request.params.messageId, projectId: project.id },
					select: {
						id: true,
						role: true,
						createdAt: true,
						attachments: { select: { id: true }, take: 1 },
					},
				});
				if (!target || target.role !== "USER") {
					throw Object.assign(new Error("Only your own messages can be edited."), {
						statusCode: 400,
					});
				}

				const value = request.body.value.trim();
				if (!value && !target.attachments.length) {
					throw Object.assign(new Error("Message cannot be empty."), {
						statusCode: 400,
					});
				}
				await tx.message.update({
					where: { id: target.id },
					data: { content: value },
				});
				await tx.message.deleteMany({
					where: {
						projectId: project.id,
						...rollbackScope(target.createdAt, "after"),
					},
				});
				await tx.project.update({
					where: { id: project.id },
					data: { updatedAt: new Date() },
				});
				return { value, hasAttachments: target.attachments.length > 0 };
			});
			return result;
		},
	);

	app.post(
		"/api/projects/:projectId/messages/:messageId/retry",
		{
			schema: {
				tags: ["messages"],
				operationId: "retryMessage",
				params: MessageParamsSchema,
				response: {
					200: schemaRef(RollbackResponseSchema),
					400: schemaRef(ErrorResponseSchema),
					404: schemaRef(ErrorResponseSchema),
					429: schemaRef(ErrorResponseSchema),
				},
			},
		},
		async (request, reply) => {
			const auth = getAuthPrincipal(request);

			// Charge credits for the request. If the user has insufficient credits, this will return a 429 response.
			if (!(await chargeCredits(request, auth.userId, reply))) {
				return reply;
			}

			// Validate that the message is not empty. If it is, return a 400 response.
			const project = await prisma.project.findFirst({
				where: { id: request.params.projectId, userId: auth.userId },
				select: { id: true },
			});
			if (!project) {
				return reply.code(404).send({
					statusCode: 404,
					error: "Not Found",
					message: "Project not found.",
				});
			}

			const result: RollbackResult = await prisma.$transaction(async tx => {
				const target = await tx.message.findFirst({
					where: { id: request.params.messageId, projectId: project.id },
					select: {
						role: true,
						type: true,
						createdAt: true,
						content: true,
						attachments: { select: { id: true }, take: 1 },
					},
				});
				if (!target) {
					throw Object.assign(new Error("Message not found."), {
						statusCode: 400,
					});
				}
				if (target.type === "SUMMARY") {
					throw Object.assign(new Error("Compaction checkpoints can't be retried."), {
						statusCode: 400,
					});
				}

				const prompt =
					target.role === "USER"
						? target
						: await tx.message.findFirst({
								where: {
									projectId: project.id,
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
					throw Object.assign(new Error("Nothing to retry."), {
						statusCode: 400,
					});
				}

				await tx.message.deleteMany({
					where: {
						projectId: project.id,
						...rollbackScope(target.createdAt, target.role === "USER" ? "after" : "from"),
					},
				});
				await tx.project.update({
					where: { id: project.id },
					data: { updatedAt: new Date() },
				});
				return {
					value: prompt.content,
					hasAttachments: prompt.attachments.length > 0,
				};
			});
			return result;
		},
	);
}
