import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { clerkPlugin } from "@clerk/fastify";
import { resolveClerkPrincipal } from "./auth/clerk-auth.js";

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

  // Temporary ARCH-03 compatibility endpoint.
  // Remove once real protected Fastify transports use AuthPrincipal.
  app.register(async (protectedApp) => {
    protectedApp.register(clerkPlugin);
    
    protectedApp.get("/api/auth/probe", async (request, reply) => {
      const principal = resolveClerkPrincipal(request);
      return principal ?? reply.code(401).send({ error: "Unauthorized" });
    });
  });

  return app;
}
