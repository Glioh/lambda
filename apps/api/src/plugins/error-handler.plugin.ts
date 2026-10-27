import type { ApplicationErrorCode } from "../common/errors.js";
import fp from "fastify-plugin";
import { ApplicationError } from "../common/errors.js";

const applicationErrorResponses = {
	INVALID_INPUT: { statusCode: 400, error: "Bad Request", includeCode: false },
	NOT_FOUND: { statusCode: 404, error: "Not Found", includeCode: false },
	CONFLICT: { statusCode: 409, error: "Conflict", includeCode: true },
	USAGE_LIMIT_EXCEEDED: { statusCode: 429, error: "Too Many Requests", includeCode: true },
} satisfies Record<
	ApplicationErrorCode,
	{ statusCode: number; error: string; includeCode: boolean }
>;

function getErrorStatusCode(error: unknown): number {
	if (typeof error !== "object" || error === null || !("statusCode" in error)) {
		return 500;
	}

	return typeof error.statusCode === "number" ? error.statusCode : 500;
}

export const errorHandlerPlugin = fp(
	async app => {
		// Fastify default 500 error response shows actual internal error message.
		// We override it to avoid leaking internal error details to clients.
		app.setErrorHandler((error, request, reply) => {
			if (error instanceof ApplicationError) {
				const response = applicationErrorResponses[error.code];
				return reply.code(response.statusCode).send({
					statusCode: response.statusCode,
					error: response.error,
					message: error.message,
					...(response.includeCode ? { code: error.code } : {}),
				});
			}
			const statusCode = getErrorStatusCode(error);
			if (statusCode < 500) {
				return reply.code(statusCode).send(error);
			}

			request.log.error({ err: error }, "Unhandled API error");
			return reply.code(500).send({
				statusCode: 500,
				error: "Internal Server Error",
				message: "Internal Server Error",
			});
		});
	},
	{
		name: "lambda-api-error-handler",
		fastify: "5.x",
	},
);
