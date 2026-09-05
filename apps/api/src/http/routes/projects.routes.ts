import type { ApiRouteDependencies } from "./dependencies.js";
import type { ApiFastifyInstance } from "./types.js";
import { Type } from "typebox";
import { getAuthPrincipal } from "../../auth/clerk-auth.js";
import { CreateProjectBodySchema, ErrorResponseSchema, GenerateTitleResponseSchema, ProjectIdParamsSchema, ProjectIdResponseSchema, ProjectListItemSchema, ProjectSchema, RenameProjectBodySchema, RenameProjectResponseSchema, schemaRef, } from "../../contracts/index.js";
import { projectRepository } from "../../repositories/project.repository.js";
import { projectService } from "../../services/project.service.js";
import { ATTACHMENT_REQUEST_BODY_LIMIT } from "../attachment-limits.js";
import { serializeProject, serializeProjectListItem } from "../serializers.js";
import { defaultRouteDependencies } from "./dependencies.js";

export function registerProjectRoutes(
	app: ApiFastifyInstance,
	dependencies: ApiRouteDependencies = defaultRouteDependencies,
) {
	const { prisma, chargeCredits, generateChatTitle } = dependencies;
	const service = projectService(projectRepository(prisma), chargeCredits, generateChatTitle);

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
			return (await service.list(auth.userId)).map(serializeProjectListItem);
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
		async request => {
			const auth = getAuthPrincipal(request);
			return serializeProject(await service.get(auth.userId, request.params.projectId));
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
			return reply
				.code(201)
				.send(serializeProject(await service.create(auth.userId, request.body, auth.isPro)));
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
		async request => {
			const auth = getAuthPrincipal(request);
			return service.rename(auth.userId, request.params.projectId, request.body.name);
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
		async request => {
			const auth = getAuthPrincipal(request);
			return service.delete(auth.userId, request.params.projectId);
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
			return service.generateTitle(auth.userId, request.params.projectId);
		},
	);
}
