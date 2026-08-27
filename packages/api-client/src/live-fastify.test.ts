import assert from "node:assert/strict";
import { describe, it } from "node:test";

import Fastify from "fastify";
import { createClient, parseEventStream, ResponseError } from "./generated/.kubb/client";

const errorBody = (status: number) => ({
	statusCode: status,
	error: status >= 500 ? "Internal Server Error" : "Error",
	message: `Handshake failed with ${status}.`,
});

async function startStreamServer() {
	const app = Fastify({ logger: false });

	app.get("/stream/complete", async (_request, reply) => {
		reply.hijack();
		reply.raw.writeHead(200, { "content-type": "text/event-stream" });
		reply.raw.write('event: token\ndata: {"value":"one"}\n\n');
		reply.raw.write('event: token\ndata: {"value":"two"}\n\n');
		reply.raw.end();
	});

	app.get("/stream/disconnect", async (_request, reply) => {
		reply.hijack();
		reply.raw.writeHead(200, { "content-type": "text/event-stream" });
		reply.raw.write('event: token\ndata: {"value":"partial"}\n\n');
		setImmediate(() => reply.raw.destroy());
	});

	app.get<{ Params: { status: string } }>("/stream/error/:status", async (request, reply) => {
		const status = Number(request.params.status);
		return reply.code(status).type("application/json").send(errorBody(status));
	});

	const baseURL = await app.listen({ host: "127.0.0.1", port: 0 });
	return { app, baseURL };
}

async function readEvents(
	baseURL: string,
	path: string,
	seen: Array<{ data: { value: string }; event?: string }> = [],
) {
	const client = createClient({ baseURL });
	const result = await client({
		method: "GET",
		responseType: "stream",
		url: path,
	});
	const events = [];
	for await (const event of parseEventStream<{ value: string }>(
		result.data as ReadableStream<Uint8Array>,
	)) {
		events.push(event);
		seen.push(event);
	}
	return events;
}

describe("Kubb Fetch runtime SSE semantics against live Fastify", () => {
	it("preserves SSE event order on normal completion", async () => {
		const { app, baseURL } = await startStreamServer();
		try {
			const events = await readEvents(baseURL, "/stream/complete");
			assert.deepEqual(
				events.map(event => event.data),
				[{ value: "one" }, { value: "two" }],
			);
			assert.deepEqual(
				events.map(event => event.event),
				["token", "token"],
			);
		} finally {
			await app.close();
		}
	});

	it("surfaces mid-stream disconnect", async () => {
		const { app, baseURL } = await startStreamServer();
		try {
			const seen: Array<{ data: { value: string }; event?: string }> = [];
			await assert.rejects(readEvents(baseURL, "/stream/disconnect", seen));
			assert.deepEqual(
				seen.map(event => event.data),
				[{ value: "partial" }],
			);
		} finally {
			await app.close();
		}
	});

	for (const status of [400, 429, 500]) {
		it(`preserves JSON handshake error status ${status}`, async () => {
			const { app, baseURL } = await startStreamServer();
			try {
				const client = createClient({ baseURL });
				let caught: unknown;
				try {
					await client({
						method: "GET",
						responseType: "stream",
						url: `/stream/error/${status}`,
					});
				} catch (error) {
					caught = error;
				}
				assert.ok(caught instanceof ResponseError);
				assert.equal(caught.status, status);
				// Native Kubb stream mode keeps handshake data as a stream; no Lambda
				// transport or generated-code workaround is used in this proof.
				assert.equal(typeof (caught.data as ReadableStream).getReader, "function");
				assert.deepEqual(await caught.response.clone().json(), errorBody(status));
			} finally {
				await app.close();
			}
		});
	}
});
