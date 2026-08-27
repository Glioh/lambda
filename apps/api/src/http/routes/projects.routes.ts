import { generateSlug } from "random-word-slugs";
import { Type } from "typebox";
import { CreateProjectBodySchema, ErrorResponseSchema, GenerateTitleResponseSchema, ProjectIdParamsSchema, ProjectIdResponseSchema, ProjectListItemSchema, ProjectSchema, RenameProjectBodySchema, RenameProjectResponseSchema, schemaRef, } from "../../contracts/index.js";
import { validateAttachments, AttachmentValidationError } from "../../attachments/validation.js";
import { ATTACHMENT_REQUEST_BODY_LIMIT } from "../attachment-limits.js";
import { serializeProject, serializeProjectListItem } from "../serializers.js";
import { getAuthPrincipal } from "../../auth/clerk-auth.js";
import { defaultRouteDependencies, type ApiRouteDependencies } from "./dependencies.js";
import type { ApiFastifyInstance } from "./types.js";

export function registerProjectRoutes(
	app: ApiFastifyInstance,
	dependencies: ApiRouteDependencies = defaultRouteDependencies,
) {
	const { prisma, chargeCredits, generateChatTitle } = dependencies;

	app.get(
		"/api/projects",
		{
			schema: {
				tags: ["projects"],
				operationId: "listProjects",
				response: {
					200: Type.Array(schemaRef(ProjectListItemSchema)),
				},
			},
		},
		async request => {
			const auth = getAuthPrincipal(request);
			const projects = await prisma.project.findMany({
				where: { userId: auth.userId },
				orderBy: { updatedAt: "desc" },
				take: 200,
				select: {
					id: true,
					name: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			return projects.map(serializeProjectListItem);
		},
	);

	app.get(
		"/api/projects/:projectId",
		{
			schema: {
				tags: ["projects"],
				operationId: "getProject",
				params: ProjectIdParamsSchema,
				response: {
					200: schemaRef(ProjectSchema),
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
				select: {
					id: true,
					name: true,
					createdAt: true,
					updatedAt: true,
					titleGeneratedAt: true,
				},
			});
			if (!project) {
				return reply.code(404).send({
					statusCode: 404,
					error: "Not Found",
					message: "Project not found.",
				});
			}
			return serializeProject(project);
		},
	);

	app.post(
		"/api/projects",
		{
			bodyLimit: ATTACHMENT_REQUEST_BODY_LIMIT,
			schema: {
				tags: ["projects"],
				operationId: "createProject",
				body: CreateProjectBodySchema,
				response: {
					201: schemaRef(ProjectSchema),
					400: schemaRef(ErrorResponseSchema),
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

			const project = await prisma.project.create({
				data: {
					userId: auth.userId,
					name: generateSlug(2, { format: "kebab" }),
					messages: {
						create: {
							content: request.body.value,
							role: "USER",
							type: "RESULT",
							...(attachments.length ? { attachments: { create: attachments } } : {}),
						},
					},
				},
				select: {
					id: true,
					name: true,
					createdAt: true,
					updatedAt: true,
					titleGeneratedAt: true,
				},
			});
			return reply.code(201).send(serializeProject(project));
		},
	);

	// Update project name
	app.patch(
		"/api/projects/:projectId",
		{
			schema: {
				tags: ["projects"],
				operationId: "renameProject",
				params: ProjectIdParamsSchema,
				body: RenameProjectBodySchema,
				response: {
					200: schemaRef(RenameProjectResponseSchema),
					400: schemaRef(ErrorResponseSchema),
					404: schemaRef(ErrorResponseSchema),
				},
			},
		},
		async (request, reply) => {
			const auth = getAuthPrincipal(request);
			const name = request.body.name.trim();
			if (!name || name.length > 100) {
				return reply.code(400).send({
					statusCode: 400,
					error: "Bad Request",
					message: name ? "Name is too long." : "Name cannot be empty.",
				});
			}

			const result = await prisma.project.updateMany({
				where: {
					id: request.params.projectId,
					userId: auth.userId,
				},
				data: { name, titleGeneratedAt: new Date() },
			});
			if (!result.count) {
				return reply.code(404).send({
					statusCode: 404,
					error: "Not Found",
					message: "Project not found.",
				});
			}
			return { id: request.params.projectId, name };
		},
	);

	app.delete(
		"/api/projects/:projectId",
		{
			schema: {
				tags: ["projects"],
				operationId: "deleteProject",
				params: ProjectIdParamsSchema,
				response: {
					200: schemaRef(ProjectIdResponseSchema),
					404: schemaRef(ErrorResponseSchema),
				},
			},
		},
		async (request, reply) => {
			const auth = getAuthPrincipal(request);
			const result = await prisma.project.deleteMany({
				where: {
					id: request.params.projectId,
					userId: auth.userId,
				},
			});
			if (!result.count) {
				return reply.code(404).send({
					statusCode: 404,
					error: "Not Found",
					message: "Project not found.",
				});
			}
			return { id: request.params.projectId };
		},
	);

	app.post(
		"/api/projects/:projectId/generate-title",
		{
			schema: {
				tags: ["projects"],
				operationId: "generateProjectTitle",
				params: ProjectIdParamsSchema,
				response: {
					200: schemaRef(GenerateTitleResponseSchema),
				},
			},
		},
		async request => {
			const auth = getAuthPrincipal(request);
			const claimedAt = new Date();
			const claim = await prisma.project.updateMany({
				where: {
					id: request.params.projectId,
					userId: auth.userId,
					titleGeneratedAt: null,
				},
				data: { titleGeneratedAt: claimedAt },
			});
			if (!claim.count) return null;

			const source = await prisma.message.findMany({
				where: {
					projectId: request.params.projectId,
					type: { not: "SUMMARY" },
				},
				orderBy: { createdAt: "asc" },
				take: 2,
				select: {
					role: true,
					content: true,
					attachments: { select: { id: true }, take: 1 },
				},
			});
			const name = await generateChatTitle(
				source.map(message => ({
					role: message.role,
					content: message.content,
					hasImage: message.attachments.length > 0,
				})),
			);
			if (!name) return null;

			const result = await prisma.project.updateMany({
				where: {
					id: request.params.projectId,
					userId: auth.userId,
					titleGeneratedAt: claimedAt,
				},
				data: { name },
			});
			return result.count ? { id: request.params.projectId, name } : null;
		},
	);
}
