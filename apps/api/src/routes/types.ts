import type { messageService } from "../services/message.service.js";
import type { projectService } from "../services/project.service.js";
import type { usageService } from "../services/usage.service.js";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault, } from "fastify";

export type ApiFastifyInstance = FastifyInstance<
	RawServerDefault,
	RawRequestDefaultExpression,
	RawReplyDefaultExpression,
	FastifyBaseLogger,
	TypeBoxTypeProvider
>;

export type ApiRouteDependencies = {
	projects: ReturnType<typeof projectService>;
	messages: ReturnType<typeof messageService>;
	usage: ReturnType<typeof usageService>;
};
