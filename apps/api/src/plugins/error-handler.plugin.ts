import fp from "fastify-plugin";

export const errorHandlerPlugin = fp(
	async app => {
		// Fastify default 500 error response shows actual internal error message.
		// We override it to avoid leaking internal error details to clients.
		app.setErrorHandler((error, request, reply) => {
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
