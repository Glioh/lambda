import type { ApiRouteDependencies } from "./dependencies.js";
import type { ApiFastifyInstance } from "./types.js";
import { Type } from "typebox";
import { getAuthPrincipal } from "../../auth/clerk-auth.js";
import { CreateMessageBodySchema, EditMessageBodySchema, ErrorResponseSchema, MessageParamsSchema, MessageSchema, ProjectIdParamsSchema, RollbackResponseSchema, schemaRef, } from "../../contracts/index.js";
import { messageRepository } from "../../repositories/message.repository.js";
import { messageService } from "../../services/message.service.js";
import { ATTACHMENT_REQUEST_BODY_LIMIT } from "../attachment-limits.js";
import { serializeMessage } from "../serializers.js";
import { defaultRouteDependencies } from "./dependencies.js";

export function registerMessageRoutes(
	app: ApiFastifyInstance,
	dependencies: ApiRouteDependencies = defaultRouteDependencies,
) {
	const { prisma, chargeCredits } = dependencies;
	const service = messageService(messageRepository(prisma), chargeCredits);

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
		async request => {
			const auth = getAuthPrincipal(request);
			return (await service.list(auth.userId, request.params.projectId)).map(serializeMessage);
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
			return reply
				.code(201)
				.send(
					serializeMessage(
						await service.create(auth.userId, request.params.projectId, request.body, auth.isPro),
					),
				);
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
		async request => {
			const auth = getAuthPrincipal(request);
			return service.edit(
				auth.userId,
				request.params.projectId,
				request.params.messageId,
				request.body.value,
				auth.isPro,
			);
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
		async request => {
			const auth = getAuthPrincipal(request);
			return service.retry(
				auth.userId,
				request.params.projectId,
				request.params.messageId,
				auth.isPro,
			);
		},
	);
}
