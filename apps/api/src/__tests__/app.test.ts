import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { Type, type TSchema } from "typebox";
import * as contracts from "@lambda/api-contracts";
import { buildApp } from "../app.js";
import type { ApiRouteDependencies } from "../http/routes/dependencies.js";
import { DEFAULT_HOST, DEFAULT_PORT, getServerConfig } from "../config.js";

describe("API application", () => {
	let app: FastifyInstance | undefined;
	const routeDependencies = {
		prisma: { project: { findMany: async () => [] } },
		chargeCredits: async () => true,
		getUsageStatus: async () => null,
		generateChatTitle: async () => null,
	} as unknown as ApiRouteDependencies;

	afterEach(async () => {
		await app?.close();
	});

	it("returns schema-defined health response", async () => {
		app = buildApp({
			logger: false,
			principalResolver: () => ({ userId: "user-1", sessionId: "session-1" }),
			routeDependencies,
		});

		assert.equal(app.server.listening, false);

		const response = await app.inject({
			method: "GET",
			url: "/api/health",
		});

		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), { status: "ok" });
		assert.match(response.headers["content-type"] ?? "", /application\/json/);
	});

	it("publishes route schemas through OpenAPI", async () => {
		app = buildApp({
			logger: false,
			principalResolver: () => ({ userId: "user-1", sessionId: "session-1" }),
			routeDependencies,
		});
		const response = await app.inject({ method: "GET", url: "/api/openapi.json" });

		assert.equal(response.statusCode, 200);
		const document = response.json() as {
			paths?: Record<string, unknown>;
			components?: { schemas?: Record<string, unknown> };
		};
		assert.ok(document.paths?.["/api/projects"]);
		assert.ok(document.paths?.["/api/projects/{projectId}/messages"]);
		assert.equal(document.paths?.["/api/health"], undefined);
		assert.equal(document.paths?.["/api/openapi.json"], undefined);
		const schemaNames = Object.keys(document.components?.schemas ?? {});
		const registeredSchemas = app.getSchemas() as Record<string, { $id?: string }>;
		const reusableSchemas = (Object.values(contracts) as unknown[]).filter(
			(schema): schema is TSchema & { $id: string } =>
				typeof schema === "object" &&
				schema !== null &&
				"~kind" in schema &&
				typeof (schema as { $id?: unknown }).$id === "string",
		);
		for (const schema of reusableSchemas) {
			assert.deepEqual(registeredSchemas[schema.$id], schema);
			assert.ok(schemaNames.includes(schema.$id));
		}
		assert.ok(reusableSchemas.length > 0);
		assert.equal(
			schemaNames.some(name => /^(?:def-?\d+)$/i.test(name)),
			false,
		);
		const projectGet = document.paths?.["/api/projects/{projectId}"] as {
			get?: {
				responses?: {
					401?: { content?: { "application/json"?: { schema?: unknown } } };
				};
			};
		};
		assert.deepEqual(projectGet.get?.responses?.[401]?.content?.["application/json"]?.schema, {
			$ref: "#/components/schemas/ErrorResponse",
		});
		const operationIds = {
			"GET /api/projects": "listProjects",
			"GET /api/projects/{projectId}": "getProject",
			"POST /api/projects": "createProject",
			"PATCH /api/projects/{projectId}": "renameProject",
			"DELETE /api/projects/{projectId}": "deleteProject",
			"POST /api/projects/{projectId}/generate-title": "generateProjectTitle",
			"GET /api/projects/{projectId}/messages": "listMessages",
			"POST /api/projects/{projectId}/messages": "createMessage",
			"POST /api/projects/{projectId}/messages/{messageId}/edit-and-resend": "editAndResendMessage",
			"POST /api/projects/{projectId}/messages/{messageId}/retry": "retryMessage",
			"GET /api/usage": "getUsage",
		} as const;
		for (const [route, operationId] of Object.entries(operationIds)) {
			const [method, path] = route.split(" ") as [
				Lowercase<"GET" | "POST" | "PATCH" | "DELETE">,
				string,
			];
			const operation: { operationId?: string } | undefined = (
				document.paths?.[path] as Record<string, { operationId?: string }>
			)?.[method.toLowerCase()];
			assert.equal(operation?.operationId, operationId);
		}
		for (const path of [
			"/api/projects/{projectId}/messages/{messageId}/edit-and-resend",
			"/api/projects/{projectId}/messages/{messageId}/retry",
		]) {
			const post = (
				document.paths?.[path] as {
					post?: { responses?: Record<string, unknown> };
				}
			)?.post;
			assert.ok(post?.responses?.["429"]);
		}
		for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
			if (!path.startsWith("/api/")) continue;
			for (const operation of Object.values(pathItem as Record<string, unknown>)) {
				if (!operation || typeof operation !== "object" || !("responses" in operation)) continue;
				const responses = (operation as { responses?: Record<string, unknown> }).responses;
				assert.ok(responses?.["401"], `missing protected 401 response for ${path}`);
			}
		}
	});

	it("keeps exported TypeBox schemas without $id route-local", () => {
		assert.equal(Object.prototype.hasOwnProperty.call(contracts.DateTimeSchema, "$id"), false);
		assert.equal(contracts.DateTimeSchema["~kind"], "String");

		app = buildApp({
			logger: false,
			principalResolver: () => ({ userId: "user-1", sessionId: "session-1" }),
			routeDependencies,
		});

		assert.equal(app.getSchemas()["DateTimeSchema"], undefined);
	});

	it("resolves shared schema references inside protected routes", async () => {
		app = buildApp({
			logger: false,
			principalResolver: () => ({ userId: "user-1", sessionId: "session-1" }),
			routeDependencies,
		});

		await app.ready();
		const projectGet = app.swagger().paths?.["/api/projects/{projectId}"] as {
			get?: {
				responses?: {
					401?: { content?: { "application/json"?: { schema?: unknown } } };
				};
			};
		};
		assert.deepEqual(projectGet.get?.responses?.[401]?.content?.["application/json"]?.schema, {
			$ref: "#/components/schemas/ErrorResponse",
		});
	});

	it("rejects reusable schemas with invalid $ids", async () => {
		for (const id of ["", "   ", " Project ", 1]) {
			const invalidApp = Fastify({ logger: false });
			invalidApp.register(
				async instance => {
					const schema = Type.Object({}, { $id: id as string });
					const value = (schema as { $id?: unknown }).$id;
					if (value === undefined) return;
					if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
						throw new Error("Reusable API schemas require a valid non-empty $id.");
					}
					instance.addSchema(schema);
				},
				{ name: `invalid-schema-${String(id)}` },
			);

			await assert.rejects(
				Promise.resolve(invalidApp.ready()),
				/Reusable API schemas require a valid non-empty \$id\./,
			);
			await invalidApp.close();
		}
	});

	it("lets Fastify reject duplicate schema $ids", async () => {
		const duplicateApp = Fastify({ logger: false });
		duplicateApp.register(
			async instance => {
				instance.addSchema(Type.Object({}, { $id: "Duplicate" }));
				instance.addSchema(Type.String({ $id: "Duplicate" }));
			},
			{ name: "duplicate-schema" },
		);

		await assert.rejects(
			Promise.resolve(duplicateApp.ready()),
			/Schema with id 'Duplicate' already declared!/,
		);
		await duplicateApp.close();
	});

	it("ignores exported objects with $id that are not TypeBox schemas", async () => {
		const unrelated = { $id: "NotATypeBoxSchema" };
		app = Fastify({ logger: false });
		app.register(
			async instance => {
				if (typeof unrelated === "object" && unrelated !== null && "~kind" in unrelated) {
					instance.addSchema(unrelated);
				}
			},
			{ name: "ignore-non-typebox" },
		);

		await app.ready();
		assert.equal(app.getSchemas()["NotATypeBoxSchema"], undefined);
	});

	it("uses injected principal for protected production routes", async () => {
		let resolved = false;
		app = buildApp({
			logger: false,
			principalResolver: () => {
				resolved = true;
				return { userId: "user-1", sessionId: "session-1" };
			},
			routeDependencies,
		});

		const response = await app.inject({ method: "GET", url: "/api/projects" });

		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), []);
		assert.equal(resolved, true);
	});

	it("returns 401 when principal resolver returns no principal", async () => {
		app = buildApp({ logger: false, principalResolver: () => null, routeDependencies });

		const response = await app.inject({ method: "GET", url: "/api/projects" });

		assert.equal(response.statusCode, 401);
		assert.deepEqual(response.json(), {
			statusCode: 401,
			error: "Unauthorized",
			message: "Not authenticated.",
		});
	});

	it("keeps public routes outside the protected auth scope", async () => {
		let resolved = 0;
		app = buildApp({
			logger: false,
			principalResolver: () => {
				resolved += 1;
				return null;
			},
			routeDependencies,
		});

		const health = await app.inject({ method: "GET", url: "/api/health" });
		const openapi = await app.inject({ method: "GET", url: "/api/openapi.json" });
		const protectedRoute = await app.inject({ method: "GET", url: "/api/projects" });

		assert.equal(health.statusCode, 200);
		assert.equal(openapi.statusCode, 200);
		assert.equal(protectedRoute.statusCode, 401);
		assert.equal(resolved, 1);
	});

	it("uses Fastify validation errors", async () => {
		app = buildApp({
			logger: false,
			principalResolver: () => ({ userId: "user-1", sessionId: "session-1" }),
			routeDependencies,
		});

		const response = await app.inject({
			method: "POST",
			url: "/api/projects",
			headers: { "content-type": "application/json" },
			payload: {},
		});

		assert.equal(response.statusCode, 400);
		assert.equal(response.json().statusCode, 400);
		assert.equal(response.json().code, "FST_ERR_VALIDATION");
		assert.equal(response.json().error, "Bad Request");
	});

	it("uses Fastify malformed-JSON errors", async () => {
		app = buildApp({
			logger: false,
			principalResolver: () => ({ userId: "user-1", sessionId: "session-1" }),
			routeDependencies,
		});

		const response = await app.inject({
			method: "POST",
			url: "/api/projects",
			headers: { "content-type": "application/json" },
			payload: "{bad",
		});

		assert.deepEqual(response.json(), {
			statusCode: 400,
			error: "Bad Request",
			message: "Body is not valid JSON but content-type is set to 'application/json'",
			code: "FST_ERR_CTP_INVALID_JSON_BODY",
		});
	});

	it("uses Fastify's native unmatched-route response", async () => {
		app = buildApp({ logger: false, principalResolver: () => null, routeDependencies });

		const response = await app.inject({ method: "GET", url: "/api/missing" });

		assert.deepEqual(response.json(), {
			statusCode: 404,
			error: "Not Found",
			message: "Route GET:/api/missing not found",
		});
	});

	it("hides unexpected exception messages", async () => {
		app = buildApp({
			logger: false,
			principalResolver: () => ({ userId: "user-1", sessionId: "session-1" }),
			routeDependencies,
		});
		app.get("/api/test-error", async () => {
			throw new Error("secret internal detail");
		});

		const response = await app.inject({ method: "GET", url: "/api/test-error" });

		assert.deepEqual(response.json(), {
			statusCode: 500,
			error: "Internal Server Error",
			message: "Internal Server Error",
		});
	});

	it("applies safe error handling to protected routes", async () => {
		app = buildApp({
			logger: false,
			principalResolver: () => ({ userId: "user-1", sessionId: "session-1" }),
			routeDependencies: {
				...routeDependencies,
				prisma: {
					project: {
						findMany: async () => {
							throw new Error("secret protected detail");
						},
					},
				},
			} as unknown as ApiRouteDependencies,
		});

		const response = await app.inject({ method: "GET", url: "/api/projects" });

		assert.deepEqual(response.json(), {
			statusCode: 500,
			error: "Internal Server Error",
			message: "Internal Server Error",
		});
	});

	it("fails to build production app without Clerk configuration", () => {
		const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
		const secretKey = process.env.CLERK_SECRET_KEY;
		delete process.env.CLERK_PUBLISHABLE_KEY;
		delete process.env.CLERK_SECRET_KEY;

		try {
			assert.throws(() => buildApp({ logger: false }), /CLERK_PUBLISHABLE_KEY/);
		} finally {
			if (publishableKey === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
			else process.env.CLERK_PUBLISHABLE_KEY = publishableKey;
			if (secretKey === undefined) delete process.env.CLERK_SECRET_KEY;
			else process.env.CLERK_SECRET_KEY = secretKey;
		}
	});
});

describe("API server configuration", () => {
	it("defaults to localhost:4000", () => {
		assert.deepEqual(getServerConfig({}), {
			host: DEFAULT_HOST,
			port: DEFAULT_PORT,
		});
	});

	it("accepts API-specific environment overrides", () => {
		assert.deepEqual(
			getServerConfig({
				API_HOST: "127.0.0.1",
				API_PORT: "4500",
			}),
			{
				host: "127.0.0.1",
				port: 4500,
			},
		);
	});

	it("rejects invalid ports", () => {
		for (const rawPort of ["0", "-1", "70000", "abc"]) {
			assert.throws(
				() => getServerConfig({ API_PORT: rawPort }),
				new RegExp(`Invalid API port: ${rawPort}`),
			);
		}
	});
});
