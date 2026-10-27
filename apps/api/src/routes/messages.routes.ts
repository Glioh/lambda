import type { ApiFastifyInstance, ApiRouteDependencies } from "./types.js";
import { Type } from "typebox";
import { ATTACHMENT_REQUEST_BODY_LIMIT } from "../constants.js";
import { CreateMessageBodySchema, EditMessageBodySchema, ErrorResponseSchema, MessageParamsSchema, MessageSchema, ProjectIdParamsSchema, RollbackResponseSchema, schemaRef, } from "../contracts/index.js";
import { getAuthPrincipal, getProPlan } from "../plugins/auth.plugin.js";

export function registerMessageRoutes(app: ApiFastifyInstance, dependencies: ApiRouteDependencies) {
	const service = dependencies.messages;

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
			return service.list(auth.userId, request.params.projectId);
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
					await service.create(
						auth.userId,
						request.params.projectId,
						request.body,
						getProPlan(request),
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
				getProPlan(request),
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
				getProPlan(request),
			);
		},
	);
}
