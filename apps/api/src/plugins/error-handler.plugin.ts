import fp from "fastify-plugin";
import { ApplicationError } from "../application-error.js";

export const errorHandlerPlugin = fp(
	async app => {
		// Fastify default 500 error response shows actual internal error message.
		// We override it to avoid leaking internal error details to clients.
		app.setErrorHandler((error, request, reply) => {
			if (error instanceof ApplicationError) {
				const statusCode =
					error.code === "NOT_FOUND" ? 404 : error.code === "USAGE_LIMIT_EXCEEDED" ? 429 : 400;
				return reply.code(statusCode).send({
					statusCode,
					error:
						statusCode === 404
							? "Not Found"
							: statusCode === 429
								? "Too Many Requests"
								: "Bad Request",
					message: error.message,
					...(statusCode === 429 ? { code: error.code } : {}),
				});
			}
			const statusCode =
				typeof error === "object" &&
				error !== null &&
				"statusCode" in error &&
				typeof error.statusCode === "number"
					? error.statusCode
					: 500;
			if (statusCode < 500) return reply.code(statusCode).send(error);

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
