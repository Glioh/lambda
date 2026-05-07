import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createChatPostHandler } from "@/app/api/chat/route";
import type { RoutingDecision } from "@/modules/routing";

const chatDecision: RoutingDecision = {
	decision: "chat",
	decisionSource: "auto",
	confidence: "low",
	requiresConfirmation: false,
};

const buildDecision: RoutingDecision = {
	decision: "build",
	decisionSource: "auto",
	confidence: "high",
	requiresConfirmation: true,
};

/**
 * Creates a request payload for the chat route test.
 * @param {string} value - The message text to submit.
 * @returns {Request} The chat route request.
 */
function createRequest(value = "What is React?") {
	return new Request("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ value, projectId: "project_1" }),
	});
}

/**
 * Produces a finite stream of assistant tokens for tests.
 * @param {string[]} tokens - The token sequence to emit.
 * @returns {AsyncGenerator<{ choices: Array<{ delta: { content: string } }> }>} The mocked token stream.
 */
async function* tokenStream(tokens: string[]) {
	for (const token of tokens) {
		yield { choices: [{ delta: { content: token } }] };
	}
}

/**
 * Produces a stream that hangs until it is aborted.
 * @param {AbortSignal | undefined} signal - The abort signal used to stop the stream.
 * @returns {AsyncGenerator<never>} A stream that only ends when aborted.
 */
async function* hangingStream(signal?: AbortSignal) {
	await new Promise<void>((_, reject) => {
		signal?.addEventListener("abort", () => reject(new Error("aborted")), {
			once: true,
		});
	});
}

/**
 * Builds a fully mocked chat handler for route-level tests.
 * @param {{ decision?: RoutingDecision; stream?: (signal?: AbortSignal) => AsyncIterable<{ choices: Array<{ delta: { content: string } }> }>; timeoutMs?: number; }} [options] - Test overrides.
 * @returns {{ POST: (request: Request) => Promise<Response>; completionCreate: ReturnType<typeof mock.fn>; decideRoute: ReturnType<typeof mock.fn>; inngestSend: ReturnType<typeof mock.fn>; messageCreate: ReturnType<typeof mock.fn>; }} The mocked test harness.
 */
function createHandler({
	decision = chatDecision,
	stream = () => tokenStream(["Hello", " world"]),
	timeoutMs = 1000,
}: {
	decision?: RoutingDecision;
	stream?: (
		signal?: AbortSignal,
	) => AsyncIterable<{ choices: Array<{ delta: { content: string } }> }>;
	timeoutMs?: number;
} = {}) {
	const inngestSend = mock.fn();
	const messageCreate = mock.fn(async (args: { data: object }) => ({
		id: "assistant_1",
		...args.data,
	}));
	const completionCreate = mock.fn(
		async (_body: object, options?: { signal?: AbortSignal }) =>
			stream(options?.signal),
	);
	const decideRoute = mock.fn(() => decision);

	const POST = createChatPostHandler({
		auth: (async () => ({ userId: "user_1" })) as never,
		decideRoute: decideRoute as never,
		timeoutMs,
		createOpenAIClient: async () =>
			({
				chat: {
					completions: {
						create: completionCreate,
					},
				},
			}) as never,
		prisma: {
			project: {
				findUnique: mock.fn(async () => ({ id: "project_1" })),
			},
			message: {
				findMany: mock.fn(async () => [
					{
						id: "message_3",
						role: "USER",
						content: "What is React?",
						type: "RESULT",
						createdAt: new Date("2026-04-23T00:00:02.000Z"),
					},
					{
						id: "message_2",
						role: "ASSISTANT",
						content: "Previous answer",
						type: "RESULT",
						createdAt: new Date("2026-04-23T00:00:01.000Z"),
					},
					{
						id: "message_1",
						role: "USER",
						content: "Previous question",
						type: "RESULT",
						createdAt: new Date("2026-04-23T00:00:00.000Z"),
					},
				]),
				create: messageCreate,
			},
			artifactVersion: {
				findFirst: mock.fn(async () => null),
			},
		} as never,
	});

	return { POST, completionCreate, decideRoute, inngestSend, messageCreate };
}

describe("POST /api/chat", () => {
	it("streams tokens, persists the assistant message, and does not dispatch Inngest", async () => {
		const { POST, completionCreate, inngestSend, messageCreate } =
			createHandler();

		const response = await POST(createRequest());
		const text = await response.text();

		assert.equal(response.status, 200);
		assert.match(response.headers.get("Content-Type") ?? "", /text\/event-stream/);
		assert.match(text, /data: {"token":"Hello"}/);
		assert.match(text, /data: {"token":" world"}/);
		assert.match(text, /data: \[DONE\]/);
		assert.equal(
			(completionCreate.mock.calls[0].arguments[0] as { model: string }).model,
			"gpt-4.1",
		);
		assert.match(
			JSON.stringify(
				(completionCreate.mock.calls[0].arguments[0] as { messages: unknown[] })
					.messages,
			),
			/Thread-level memory context/,
		);
		assert.equal(messageCreate.mock.callCount(), 1);
		assert.deepEqual(messageCreate.mock.calls[0].arguments[0].data, {
			projectId: "project_1",
			content: "Hello world",
			role: "ASSISTANT",
			type: "RESULT",
		});
		assert.equal(inngestSend.mock.callCount(), 0);
	});

	it("persists an error message and emits an error event when the stream times out before tokens", async () => {
		const { POST, messageCreate } = createHandler({
			stream: (signal) => hangingStream(signal),
			timeoutMs: 1,
		});

		const response = await POST(createRequest());
		const text = await response.text();

		assert.equal(response.status, 200);
		assert.match(text, /event: error/);
		assert.match(text, /data: \[DONE\]/);
		assert.equal(messageCreate.mock.callCount(), 1);
		assert.deepEqual(messageCreate.mock.calls[0].arguments[0].data, {
			projectId: "project_1",
			content: "Chat response timed out. Please try again.",
			role: "ASSISTANT",
			type: "ERROR",
		});
	});

	it("returns 400 when the server-side guard routes to build", async () => {
		const { POST, completionCreate, messageCreate } = createHandler({
			decision: buildDecision,
		});

		const response = await POST(createRequest("build a dashboard"));

		assert.equal(response.status, 400);
		assert.equal(completionCreate.mock.callCount(), 0);
		assert.equal(messageCreate.mock.callCount(), 0);
	});
});
