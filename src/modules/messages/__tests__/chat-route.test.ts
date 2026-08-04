import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createChatPostHandler } from "@/app/api/chat/route";
import { SUMMARY_PREAMBLE, type ContextConfig } from "@/modules/context";

/** Large budget so compaction never triggers unless a test opts in. */
const relaxedContextConfig: ContextConfig = {
	contextTokenBudget: 100_000,
	reserveOutputTokens: 1_000,
	keepRecentTokens: 8_000,
	summaryMaxTokens: 600,
	minKeepMessages: 2,
	historyFetchCap: 200,
	maxImagesInContext: 4,
};

/** Tiny budget so compaction triggers with a handful of messages. */
const tinyContextConfig: ContextConfig = {
	contextTokenBudget: 150,
	reserveOutputTokens: 20,
	keepRecentTokens: 30,
	summaryMaxTokens: 50,
	minKeepMessages: 2,
	historyFetchCap: 200,
	maxImagesInContext: 4,
};

interface HistoryAttachment {
	id: string;
	mimeType: string;
	width: number;
	height: number;
}

interface HistoryMessage {
	role: "USER" | "ASSISTANT";
	createdAt?: Date;
	content: string;
	attachments?: HistoryAttachment[];
}

type ContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string; detail: string } };

interface CompletionBody {
	model: string;
	messages: Array<{ role: string; content: string | ContentPart[] }>;
	stream: true;
	max_tokens?: number;
}

/**
 * Creates a request payload for the chat route test.
 * @param {string} value - The message text to submit.
 * @returns {Request} The chat route request.
 */
function createRequest(value = "What is React?", signal?: AbortSignal) {
	return new Request("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ value, projectId: "project_1" }),
		signal,
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
 * Emits the given tokens, then hangs until aborted. Models a real completion
 * that the user interrupts partway through.
 * @param {string[]} tokens - Tokens to emit before hanging.
 * @param {AbortSignal | undefined} signal - Signal that ends the stream.
 * @returns {AsyncGenerator} The partial-then-hanging token stream.
 */
async function* partialThenHangingStream(
	tokens: string[],
	signal?: AbortSignal,
) {
	for (const token of tokens) {
		yield { choices: [{ delta: { content: token } }] };
	}

	yield* hangingStream(signal);
}

/**
 * Builds a fully mocked chat handler for route-level tests.
 * @param {object} [options] - Test overrides (per-call streams, history, checkpoint, context config, timeout).
 * @returns {object} The mocked test harness.
 */
function createHandler({
	streams = [() => tokenStream(["Hello", " world"])],
	history = [
		{ role: "USER", content: "What is React?" },
		{ role: "ASSISTANT", content: "Previous answer" },
		{ role: "USER", content: "Previous question" },
	],
	checkpoint = null,
	contextConfig = relaxedContextConfig,
	timeoutMs = 1000,
	attachmentData = {},
}: {
	streams?: Array<
		(
			signal?: AbortSignal,
		) => AsyncIterable<{ choices: Array<{ delta: { content: string } }> }>
	>;
	history?: HistoryMessage[]; // newest first, as returned by the DB
	checkpoint?: { content: string; createdAt: Date } | null;
	contextConfig?: ContextConfig;
	timeoutMs?: number;
	/** Base64 payloads keyed by attachment id, backing prisma.attachment.findMany. */
	attachmentData?: Record<string, string>;
} = {}) {
	const messageCreate = mock.fn(async (args: { data: object }) => ({
		id: "assistant_1",
		...args.data,
	}));

	// Stand-in for Next's `after`, which needs a request scope the tests don't
	// have. Collecting the promises lets a test await the post-disconnect write.
	const afterTasks: Array<Promise<void>> = [];
	const scheduleAfterResponse = (task: () => Promise<void>) => {
		afterTasks.push(task());
	};
	const flushAfterTasks = () => Promise.all(afterTasks);

	let completionCallIndex = 0;
	const completionCreate = mock.fn(
		async (_body: CompletionBody, options?: { signal?: AbortSignal }) => {
			const factory =
				streams[Math.min(completionCallIndex, streams.length - 1)];
			completionCallIndex += 1;
			return factory(options?.signal);
		},
	);

	// Mirrors the real second-phase fetch: only ids the route actually selected.
	const attachmentFindMany = mock.fn(
		async (args: { where: { id: { in: string[] } } }) =>
			args.where.id.in
				.filter((id) => id in attachmentData)
				.map((id) => ({ id, mimeType: "image/png", data: attachmentData[id] })),
	);

	const POST = createChatPostHandler({
		auth: (async () => ({ userId: "user_1" })) as never,
		timeoutMs,
		contextConfig,
		scheduleAfterResponse,
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
			attachment: {
				findMany: attachmentFindMany,
			},
		} as never,
	});

	return {
		POST,
		completionCreate,
		messageCreate,
		flushAfterTasks,
		attachmentFindMany,
	};
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

/**
 * Narrows a message's content to the string form, failing the test if it isn't.
 * Messages without images must stay plain strings — asserting that here is part
 * of the point, not a workaround for the union type.
 * @param {string | ContentPart[]} content - The content to narrow.
 * @returns {string} The content as a string.
 */
function asText(content: string | ContentPart[]): string {
	assert.equal(
		typeof content,
		"string",
		"expected plain string content for a message with no attachments",
	);
	return content as string;
}

describe("POST /api/chat", () => {
	it("streams tokens and persists the assistant message", async () => {
		const { POST, completionCreate, messageCreate } = createHandler();

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
			asText(message.content).startsWith(SUMMARY_PREAMBLE),
		);

		assert.ok(summaryBlock, "expected a summary context block");
		assert.equal(summaryBlock?.role, "user");
		assert.match(asText(summaryBlock?.content ?? ""), /CHECKPOINT_SUMMARY/);
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
		assert.match(asText(summarizerBody.messages[1].content), /OLD_QUESTION/);
		assert.match(asText(summarizerBody.messages[1].content), /OLD_ANSWER/);

		const chatBody = completionBodyAt(completionCreate, 1);
		const summaryBlock = chatBody.messages.find((message) =>
			asText(message.content).startsWith(SUMMARY_PREAMBLE),
		);

		assert.ok(summaryBlock, "expected the fresh checkpoint in the chat call");
		assert.match(asText(summaryBlock?.content ?? ""), /Summary text\./);
		// The folded head must no longer appear verbatim.
		assert.ok(
			chatBody.messages.every(
				(message) => !asText(message.content).includes("OLD_QUESTION"),
			),
		);
		// The tail is kept verbatim.
		assert.ok(
			chatBody.messages.some((message) =>
				asText(message.content).includes("Recent answer"),
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

	it("persists the partial answer when the client stops generation mid-stream", async () => {
		const abortController = new AbortController();
		const { POST, messageCreate, flushAfterTasks } = createHandler({
			streams: [
				(signal) => partialThenHangingStream(["Par", "tial"], signal),
			],
			// Long enough that the timeout path can't be what ends the stream.
			timeoutMs: 10_000,
		});

		const response = await POST(
			createRequest("What is React?", abortController.signal),
		);

		// Drain until both tokens have arrived, then stop like the user would.
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let seen = "";

		while (!seen.includes('"tial"')) {
			const { value, done } = await reader.read();

			if (done) {
				break;
			}

			seen += decoder.decode(value, { stream: true });
		}

		abortController.abort();
		await reader.cancel().catch(() => undefined);
		await flushAfterTasks();

		assert.match(seen, /data: {"token":"Par"}/);
		assert.equal(messageCreate.mock.callCount(), 1);
		assert.deepEqual(messageCreate.mock.calls[0].arguments[0].data, {
			projectId: "project_1",
			content: "Partial",
			role: "ASSISTANT",
			type: "RESULT",
		});
	});

	it("persists nothing when the client stops before the first token", async () => {
		const abortController = new AbortController();
		const { POST, messageCreate, flushAfterTasks } = createHandler({
			streams: [(signal) => hangingStream(signal)],
			timeoutMs: 10_000,
		});

		const response = await POST(
			createRequest("What is React?", abortController.signal),
		);

		const reader = response.body!.getReader();
		// The immediate "thinking" ack is the only frame that can have arrived.
		await reader.read();

		abortController.abort();
		await reader.cancel().catch(() => undefined);
		await flushAfterTasks();

		// Nothing streamed, so there is no partial answer worth saving — and an
		// ERROR row would misreport a deliberate stop as a failure.
		assert.equal(messageCreate.mock.callCount(), 0);
	});

	it("sends an attached image as an image_url content part", async () => {
		const { POST, completionCreate, attachmentFindMany } = createHandler({
			history: [
				{
					role: "USER",
					content: "what is in this image?",
					attachments: [
						{ id: "att_1", mimeType: "image/png", width: 1024, height: 1024 },
					],
				},
			],
			attachmentData: { att_1: "QUJD" },
		});

		await (await POST(createRequest("what is in this image?"))).text();

		const messages = completionBodyAt(completionCreate, 0).messages;
		const imageMessage = messages.find((message) =>
			Array.isArray(message.content),
		);

		assert.ok(imageMessage, "expected a multipart message");
		const parts = imageMessage.content as ContentPart[];

		assert.deepEqual(
			parts.find((part) => part.type === "image_url"),
			{
				type: "image_url",
				image_url: { url: "data:image/png;base64,QUJD", detail: "high" },
			},
		);
		assert.equal(attachmentFindMany.mock.callCount(), 1);
	});

	it("keeps content a plain string when a message has no attachments", async () => {
		const { POST, completionCreate, attachmentFindMany } = createHandler();

		await (await POST(createRequest())).text();

		// Regression guard: the string form is what the assertions in the other
		// cases (and the compaction pipeline) rely on.
		for (const message of completionBodyAt(completionCreate, 0).messages) {
			assert.equal(typeof message.content, "string");
		}

		// And with no images anywhere, the payload table is never queried.
		assert.equal(attachmentFindMany.mock.callCount(), 0);
	});

	it("never sends base64 to the summarizer, only an image placeholder", async () => {
		const base64 = "QUJDREVGRw";
		const oldQuestion = `OLD_QUESTION ${"q".repeat(400)}`;

		const { POST, completionCreate } = createHandler({
			contextConfig: tinyContextConfig,
			history: [
				{ role: "USER", content: "Recent question" },
				{ role: "ASSISTANT", content: "Recent answer" },
				{
					role: "USER",
					content: oldQuestion,
					attachments: [
						{ id: "att_old", mimeType: "image/png", width: 1024, height: 1024 },
					],
				},
			],
			attachmentData: { att_old: base64 },
			streams: [() => tokenStream(["SUMMARY"]), () => tokenStream(["Hello"])],
		});

		await (await POST(createRequest())).text();

		const summarizerBody = completionBodyAt(completionCreate, 0);
		const summarizerText = summarizerBody.messages[1].content as string;

		assert.match(summarizerText, /\[image attached: image\/png 1024×1024\]/);
		assert.equal(
			summarizerText.includes(base64),
			false,
			"summarizer must never receive the base64 payload",
		);
	});

	it("counts image tokens toward the compaction trigger", async () => {
		// Sized so the text alone comfortably fits (the system prompt is most of
		// it), leaving the image's ~765 tokens as the only thing that can push
		// this over the trigger.
		const imageBudgetConfig: ContextConfig = {
			...tinyContextConfig,
			contextTokenBudget: 400,
			reserveOutputTokens: 20,
		};

		/** Same history either way; only the image presence differs. */
		const historyFor = (withImage: boolean): HistoryMessage[] => [
			{ role: "USER", content: "b" },
			{ role: "ASSISTANT", content: "c" },
			{
				role: "USER",
				content: "a",
				...(withImage
					? {
							attachments: [
								{
									id: "att_1",
									mimeType: "image/png",
									width: 1024,
									height: 1024,
								},
							],
						}
					: {}),
			},
		];

		const withoutImage = createHandler({
			contextConfig: imageBudgetConfig,
			history: historyFor(false),
		});
		await (await withoutImage.POST(createRequest("hi"))).text();

		const withImage = createHandler({
			contextConfig: imageBudgetConfig,
			history: historyFor(true),
			attachmentData: { att_1: "QUJD" },
			streams: [() => tokenStream(["SUMMARY"]), () => tokenStream(["Hello"])],
		});
		await (await withImage.POST(createRequest("hi"))).text();

		// Tiny text alone fits; the image's ~765 tokens push it over the trigger,
		// which shows up as the extra summarizer call.
		assert.equal(withoutImage.completionCreate.mock.callCount(), 1);
		assert.equal(withImage.completionCreate.mock.callCount(), 2);
	});

	it("caps how many images are sent and degrades the rest to text markers", async () => {
		const attachmentData: Record<string, string> = {};
		const history: HistoryMessage[] = [];

		for (let index = 0; index < 6; index += 1) {
			const id = `att_${index}`;
			attachmentData[id] = "QUJD";
			history.push({
				role: "USER",
				content: `message ${index}`,
				attachments: [{ id, mimeType: "image/png", width: 512, height: 512 }],
			});
		}

		const { POST, completionCreate, attachmentFindMany } = createHandler({
			contextConfig: { ...relaxedContextConfig, maxImagesInContext: 2 },
			history,
			attachmentData,
		});

		await (await POST(createRequest("hi"))).text();

		const parts = completionBodyAt(completionCreate, 0)
			.messages.filter((message) => Array.isArray(message.content))
			.flatMap((message) => message.content as ContentPart[]);

		assert.equal(parts.filter((part) => part.type === "image_url").length, 2);
		assert.equal(
			parts.filter(
				(part) =>
					part.type === "text" && part.text.startsWith("[image omitted"),
			).length,
			4,
		);
		assert.equal(
			attachmentFindMany.mock.calls[0].arguments[0].where.id.in.length,
			2,
		);
	});

	it("rejects a request with neither text nor attachments", async () => {
		const { POST } = createHandler();

		const response = await POST(createRequest("   "));

		assert.equal(response.status, 400);
	});

	it("accepts an image-only message when hasAttachments is set", async () => {
		const { POST } = createHandler({
			history: [
				{
					role: "USER",
					content: "",
					attachments: [
						{ id: "att_1", mimeType: "image/png", width: 512, height: 512 },
					],
				},
			],
			attachmentData: { att_1: "QUJD" },
		});

		const request = new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				value: "",
				projectId: "project_1",
				hasAttachments: true,
			}),
		});

		assert.equal((await POST(request)).status, 200);
	});
});
