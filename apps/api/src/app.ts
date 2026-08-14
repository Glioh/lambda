import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

const healthResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["ok"] },
  },
} as const;

/** Builds API application without binding a network port. */
export function buildApp(
  options: Pick<FastifyServerOptions, "logger"> = {},
): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? { level: process.env.LOG_LEVEL ?? "info" },
  });

  app.get(
    "/api/health",
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async () => ({ status: "ok" as const }),
  );

  return app;
}
