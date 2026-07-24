import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createChatPostHandler } from "@/app/api/chat/route";
import { SUMMARY_PREAMBLE, type ContextConfig } from "@/modules/context";
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

/** Large budget so compaction never triggers unless a test opts in. */
const relaxedContextConfig: ContextConfig = {
	contextTokenBudget: 100_000,
	reserveOutputTokens: 1_000,
	keepRecentTokens: 8_000,
	summaryMaxTokens: 600,
	minKeepMessages: 2,
	historyFetchCap: 200,
};

/** Tiny budget so compaction triggers with a handful of messages. */
const tinyContextConfig: ContextConfig = {
	contextTokenBudget: 150,
	reserveOutputTokens: 20,
	keepRecentTokens: 30,
	summaryMaxTokens: 50,
	minKeepMessages: 2,
	historyFetchCap: 200,
};

interface HistoryMessage {
	role: "USER" | "ASSISTANT";
	createdAt?: Date;
	content: string;
}

interface CompletionBody {
	model: string;
	messages: Array<{ role: string; content: string }>;
	stream: true;
	max_tokens?: number;
}

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
 * @param {object} [options] - Test overrides (decision, per-call streams, history, checkpoint, context config, timeout).
 * @returns {object} The mocked test harness.
 */
function createHandler({
	decision = chatDecision,
	streams = [() => tokenStream(["Hello", " world"])],
	history = [
		{ role: "USER", content: "What is React?" },
		{ role: "ASSISTANT", content: "Previous answer" },
		{ role: "USER", content: "Previous question" },
	],
	checkpoint = null,
	contextConfig = relaxedContextConfig,
	timeoutMs = 1000,
}: {
	decision?: RoutingDecision;
	streams?: Array<
		(
			signal?: AbortSignal,
		) => AsyncIterable<{ choices: Array<{ delta: { content: string } }> }>
	>;
	history?: HistoryMessage[]; // newest first, as returned by the DB
	checkpoint?: { content: string; createdAt: Date } | null;
	contextConfig?: ContextConfig;
	timeoutMs?: number;
} = {}) {
	const inngestSend = mock.fn();
	const messageCreate = mock.fn(async (args: { data: object }) => ({
		id: "assistant_1",
		...args.data,
	}));

	let completionCallIndex = 0;
	const completionCreate = mock.fn(
		async (_body: CompletionBody, options?: { signal?: AbortSignal }) => {
			const factory =
				streams[Math.min(completionCallIndex, streams.length - 1)];
			completionCallIndex += 1;
			return factory(options?.signal);
		},
	);
	const decideRoute = mock.fn(() => decision);

	const POST = createChatPostHandler({
		auth: (async () => ({ userId: "user_1" })) as never,
		decideRoute: decideRoute as never,
		timeoutMs,
		contextConfig,
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
				findFirst: mock.fn(async () => checkpoint),
				findMany: mock.fn(async () => history),
				create: messageCreate,
			},
		} as never,
	});

	return { POST, completionCreate, decideRoute, inngestSend, messageCreate };
}

/**
 * Reads a completion call's request body from the mock.
 * @param {ReturnType<typeof createHandler>["completionCreate"]} completionCreate - The completion mock.
 * @param {number} index - The call index to read.
 * @returns {CompletionBody} The request body passed to the mock.
 */
function completionBodyAt(
	completionCreate: ReturnType<typeof createHandler>["completionCreate"],
	index: number,
): CompletionBody {
	return completionCreate.mock.calls[index].arguments[0] as CompletionBody;
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
		assert.equal(completionBodyAt(completionCreate, 0).model, "gpt-4.1");
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
			streams: [(signal) => hangingStream(signal)],
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

	it("replays an existing checkpoint as historical context without compacting", async () => {
		const { POST, completionCreate, messageCreate } = createHandler({
			checkpoint: {
				content: "CHECKPOINT_SUMMARY: the user is building a blog.",
				createdAt: new Date("2026-01-01T00:00:00Z"),
			},
		});

		const response = await POST(createRequest());
		await response.text();

		// No compaction: a single chat completion call.
		assert.equal(completionCreate.mock.callCount(), 1);

		const body = completionBodyAt(completionCreate, 0);
		const summaryBlock = body.messages.find((message) =>
			message.content.startsWith(SUMMARY_PREAMBLE),
		);

		assert.ok(summaryBlock, "expected a summary context block");
		assert.equal(summaryBlock?.role, "user");
		assert.match(summaryBlock?.content ?? "", /CHECKPOINT_SUMMARY/);
		// The checkpoint block comes right after the system prompt.
		assert.equal(body.messages[0].role, "system");
		assert.equal(body.messages[1].content, summaryBlock?.content);
		// Only the RESULT message is persisted.
		assert.equal(messageCreate.mock.callCount(), 1);
	});

	it("compacts over-budget history: emits status, persists a SUMMARY checkpoint, and folds the head", async () => {
		const oldQuestion = `OLD_QUESTION ${"q".repeat(400)}`;
		const oldAnswer = `OLD_ANSWER ${"a".repeat(400)}`;

		const { POST, completionCreate, messageCreate } = createHandler({
			contextConfig: tinyContextConfig,
			// Newest first, as the DB returns them.
			history: [
				{
					role: "USER",
					content: "What is React?",
					createdAt: new Date("2026-01-01T00:00:03Z"),
				},
				{
					role: "ASSISTANT",
					content: "Recent answer",
					createdAt: new Date("2026-01-01T00:00:02Z"),
				},
				{
					role: "ASSISTANT",
					content: oldAnswer,
					createdAt: new Date("2026-01-01T00:00:01Z"),
				},
				{
					role: "USER",
					content: oldQuestion,
					createdAt: new Date("2026-01-01T00:00:00Z"),
				},
			],
			streams: [
				() => tokenStream(["Summary ", "text."]),
				() => tokenStream(["Hello", " world"]),
			],
		});

		const response = await POST(createRequest());
		const text = await response.text();

		assert.match(text, /event: status\ndata: {"status":"compacting"}/);
		assert.match(text, /data: \[DONE\]/);

		// Two completion calls: summarizer first, then the chat response.
		assert.equal(completionCreate.mock.callCount(), 2);

		const summarizerBody = completionBodyAt(completionCreate, 0);
		assert.equal(
			summarizerBody.max_tokens,
			tinyContextConfig.summaryMaxTokens,
		);
		assert.match(summarizerBody.messages[1].content, /OLD_QUESTION/);
		assert.match(summarizerBody.messages[1].content, /OLD_ANSWER/);

		const chatBody = completionBodyAt(completionCreate, 1);
		const summaryBlock = chatBody.messages.find((message) =>
			message.content.startsWith(SUMMARY_PREAMBLE),
		);

		assert.ok(summaryBlock, "expected the fresh checkpoint in the chat call");
		assert.match(summaryBlock?.content ?? "", /Summary text\./);
		// The folded head must no longer appear verbatim.
		assert.ok(
			chatBody.messages.every(
				(message) => !message.content.includes("OLD_QUESTION"),
			),
		);
		// The tail is kept verbatim.
		assert.ok(
			chatBody.messages.some((message) =>
				message.content.includes("Recent answer"),
			),
		);

		// SUMMARY checkpoint persisted before the RESULT message, with its
		// createdAt boundary set to the newest FOLDED (head) message — the
		// oldAnswer at ...01Z — so the verbatim tail stays in future windows.
		assert.equal(messageCreate.mock.callCount(), 2);
		assert.deepEqual(messageCreate.mock.calls[0].arguments[0].data, {
			projectId: "project_1",
			content: "Summary text.",
			role: "ASSISTANT",
			type: "SUMMARY",
			createdAt: new Date("2026-01-01T00:00:01Z"),
		});
		assert.deepEqual(messageCreate.mock.calls[1].arguments[0].data, {
			projectId: "project_1",
			content: "Hello world",
			role: "ASSISTANT",
			type: "RESULT",
		});
	});

	it("still answers using the tail when the summarizer call fails", async () => {
		const oldQuestion = `OLD_QUESTION ${"q".repeat(400)}`;
		const oldAnswer = `OLD_ANSWER ${"a".repeat(400)}`;

		const failingStream = () => {
			throw new Error("summarizer unavailable");
		};

		const { POST, completionCreate, messageCreate } = createHandler({
			contextConfig: tinyContextConfig,
			history: [
				{ role: "USER", content: "What is React?" },
				{ role: "ASSISTANT", content: "Recent answer" },
				{ role: "ASSISTANT", content: oldAnswer },
				{ role: "USER", content: oldQuestion },
			],
			streams: [failingStream, () => tokenStream(["Hello", " world"])],
		});

		const response = await POST(createRequest());
		const text = await response.text();

		assert.match(text, /data: {"token":"Hello"}/);
		assert.match(text, /data: \[DONE\]/);
		assert.equal(completionCreate.mock.callCount(), 2);

		// No SUMMARY persisted; only the RESULT message.
		assert.equal(messageCreate.mock.callCount(), 1);
		assert.deepEqual(messageCreate.mock.calls[0].arguments[0].data, {
			projectId: "project_1",
			content: "Hello world",
			role: "ASSISTANT",
			type: "RESULT",
		});
	});
});
