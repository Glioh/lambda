import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAICompletionModel } from "../adapters/openai-completion-model";

const request = {
	purpose: "chat" as const,
	messages: [{ role: "user" as const, content: "Hello" }],
};

function responseStream(...events: string[]) {
	const encoder = new TextEncoder();
	let canceled = false;
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const event of events) controller.enqueue(encoder.encode(event));
		},
		cancel() {
			canceled = true;
		},
	});
	return { body, wasCanceled: () => canceled };
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
	const values: string[] = [];
	for await (const value of stream) values.push(value);
	return values;
}

describe("OpenAICompletionModel", () => {
	it("returns immediately at the SSE done marker", async () => {
		let sentBody: unknown;
		const responseBody = responseStream(
			'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
			"data: [DONE]\n\n",
		);
		const fetcher = async (_input: unknown, init?: RequestInit) => {
			sentBody = JSON.parse(String(init?.body));
			return new Response(responseBody.body);
		};
		const model = new OpenAICompletionModel(fetcher as typeof fetch, "key", "model");

		assert.deepEqual(await collect(await model.stream(request, new AbortController().signal)), [
			"Hello",
		]);
		assert.deepEqual(sentBody, {
			model: "model",
			messages: [{ role: "user", content: "Hello" }],
			stream: true,
		});
		assert.equal(responseBody.body.locked, false);
		assert.equal(responseBody.wasCanceled(), true);
	});

	it("throws streamed provider errors", async () => {
		const responseBody = responseStream('data: {"error":{"message":"quota exceeded"}}\n\n');
		const fetcher = async () => new Response(responseBody.body);
		const model = new OpenAICompletionModel(fetcher as typeof fetch, "key");
		const stream = await model.stream(request, new AbortController().signal);

		await assert.rejects(collect(stream), /quota exceeded/);
		assert.equal(responseBody.body.locked, false);
		assert.equal(responseBody.wasCanceled(), true);
	});

	it("rejects a missing API key before sending a request", async () => {
		let called = false;
		const fetcher = async () => {
			called = true;
			return new Response();
		};
		const model = new OpenAICompletionModel(fetcher as typeof fetch, "");

		await assert.rejects(
			model.stream(request, new AbortController().signal),
			/OPENAI_API_KEY is not configured/,
		);
		assert.equal(called, false);
	});

	it("includes provider status and response details in request failures", async () => {
		const fetcher = async () =>
			new Response('{"error":{"message":"quota exceeded"}}', { status: 429 });
		const model = new OpenAICompletionModel(fetcher as typeof fetch, "key");

		await assert.rejects(
			model.stream(request, new AbortController().signal),
			/failed \(429\).*quota exceeded/,
		);
	});
});
