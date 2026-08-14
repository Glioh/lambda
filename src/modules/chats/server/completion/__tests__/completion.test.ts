import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONTEXT_CONFIG, type ContextConfig } from "@/modules/context";
import {
	createCompleteChat,
	type ChatCompletionEvent,
	type ChatCompletionModel,
	type ChatHistoryMessage,
	type ChatStore,
	type PersistedTriggerMessage,
} from "../complete-chat";

const tinyContextConfig: ContextConfig = {
	...DEFAULT_CONTEXT_CONFIG,
	contextTokenBudget: 150,
	reserveOutputTokens: 20,
	keepRecentTokens: 30,
	summaryMaxTokens: 50,
	minKeepMessages: 2,
};

async function* tokens(values: string[]) {
	for (const value of values) yield value;
}

async function* delayedTokens(values: string[], delayMs: number) {
	await new Promise((resolve) => setTimeout(resolve, delayMs));
	yield* tokens(values);
}

async function* tokenUntilAborted(signal: AbortSignal) {
	yield "Partial";
	await waitForAbort(signal);
}

function waitForAbort(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		if (signal.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}
		signal.addEventListener(
			"abort",
			() => reject(new DOMException("Aborted", "AbortError")),
			{ once: true },
		);
	});
}

const triggerMessage = (
	overrides: Partial<PersistedTriggerMessage> = {},
): PersistedTriggerMessage => ({
	id: "message_1",
	projectId: "project_1",
	role: "USER",
	type: "RESULT",
	content: "Prompt",
	createdAt: new Date("2026-01-01T00:00:10Z"),
	attachments: [],
	...overrides,
});

const overBudgetHistory = (
	attachment?: ChatHistoryMessage["attachments"],
): ChatHistoryMessage[] => [
	{
		role: "USER",
		content: `Old question ${"q".repeat(500)}`,
		createdAt: new Date("2026-01-01T00:00:01Z"),
		...(attachment ? { attachments: attachment } : {}),
	},
	{
		role: "ASSISTANT",
		content: `Old answer ${"a".repeat(500)}`,
		createdAt: new Date("2026-01-01T00:00:02Z"),
	},
	{
		role: "USER",
		content: "Recent question",
		createdAt: new Date("2026-01-01T00:00:03Z"),
	},
	{
		role: "ASSISTANT",
		content: "Recent answer",
		createdAt: new Date("2026-01-01T00:00:04Z"),
	},
];

interface HarnessOptions {
	project?: { id: string } | null;
	trigger?: PersistedTriggerMessage | null;
	latestMessageId?: string | null;
	checkpoint?: { content: string; createdAt: Date } | null;
	history?: ChatHistoryMessage[];
	imageData?: Record<string, string>;
	contextConfig?: ContextConfig;
	modelStream?: ChatCompletionModel["stream"];
	timeoutMs?: number;
	visionTimeoutMs?: number;
	scheduleDeferred?: (task: () => Promise<void>) => void;
	onSaveMessage?: ChatStore["saveMessage"];
}

function createHarness(options: HarnessOptions = {}) {
	const savedMessages: Parameters<ChatStore["saveMessage"]>[0][] = [];
	const requests: Parameters<ChatCompletionModel["stream"]>[0][] = [];
	const imageLookups: string[][] = [];
	const store: ChatStore = {
		findProject: async () =>
			options.project === undefined ? { id: "project_1" } : options.project,
		findMessage: async () =>
			options.trigger === undefined ? triggerMessage() : options.trigger,
		findLatestMessage: async () => {
			const id = options.latestMessageId === undefined
				? (options.trigger?.id ?? "message_1")
				: options.latestMessageId;
			return id ? { id } : null;
		},
		findLatestCheckpoint: async () => options.checkpoint ?? null,
		findHistory: async () => options.history ?? [],
		findImagePayloads: async (ids) => {
			imageLookups.push(ids);
			return ids.flatMap((id) =>
				options.imageData?.[id]
					? [{ id, mimeType: "image/png", data: options.imageData[id] }]
					: [],
			);
		},
		saveMessage: async (message) => {
			await options.onSaveMessage?.(message);
			savedMessages.push(message);
		},
	};
	const model: ChatCompletionModel = {
		stream: async (...args) => {
			requests.push(args[0]);
			return options.modelStream
				? options.modelStream(...args)
				: tokens(["Answer"]);
		},
	};

	return {
		completeChat: createCompleteChat({
			store,
			model,
			contextConfig: options.contextConfig ?? DEFAULT_CONTEXT_CONFIG,
			timeoutMs: options.timeoutMs ?? 1_000,
			visionTimeoutMs: options.visionTimeoutMs ?? 2_000,
			scheduleDeferred: options.scheduleDeferred ?? (() => undefined),
		}),
		savedMessages,
		requests,
		imageLookups,
	};
}

async function collectEvents(
	events: AsyncIterable<ChatCompletionEvent>,
): Promise<ChatCompletionEvent[]> {
	const collected: ChatCompletionEvent[] = [];
	for await (const event of events) collected.push(event);
	return collected;
}

async function runHarness(
	harness: ReturnType<typeof createHarness>,
	signal = new AbortController().signal,
) {
	const result = await harness.completeChat({
		userId: "user_1",
		projectId: "project_1",
		messageId: "message_1",
		signal,
	});
	assert.equal(result.kind, "started");
	if (result.kind !== "started") throw new Error("Expected Chat to start");
	return collectEvents(result.events);
}

describe("completeChat", () => {
	it("hides unavailable or invalid trigger Messages behind not-found", async () => {
		const cases: HarnessOptions[] = [
			{ project: null },
			{ trigger: null },
			{ latestMessageId: "message_2" },
			{ trigger: triggerMessage({ projectId: "another_project" }) },
			{ trigger: triggerMessage({ role: "ASSISTANT" }) },
			{ trigger: triggerMessage({ type: "ERROR" }) },
		];

		for (const options of cases) {
			const harness = createHarness(options);
			assert.deepEqual(
				await harness.completeChat({
					userId: "user_1",
					projectId: "project_1",
					messageId: "message_1",
					signal: new AbortController().signal,
				}),
				{ kind: "not-found" },
			);
		}
	});

	it("streams ordered events and persists one assistant result", async () => {
		const harness = createHarness({
			modelStream: async () => tokens(["Hello", " world"]),
		});
		assert.deepEqual(await runHarness(harness), [
			{ kind: "thinking" },
			{ kind: "token", token: "Hello" },
			{ kind: "token", token: " world" },
			{ kind: "done" },
		]);
		assert.deepEqual(harness.savedMessages, [
			{ projectId: "project_1", content: "Hello world", type: "RESULT" },
		]);
		assert.equal(harness.requests[0].messages.at(-1)?.content, "Prompt");
	});

	it("persists an error when the model completes without content", async () => {
		const harness = createHarness({ modelStream: async () => tokens([]) });

		assert.deepEqual(await runHarness(harness), [
			{ kind: "thinking" },
			{
				kind: "error",
				message: "Something went wrong while generating the response. Please try again.",
			},
			{ kind: "done" },
		]);
		assert.deepEqual(harness.savedMessages, [
			{
				projectId: "project_1",
				content: "Something went wrong while generating the response. Please try again.",
				type: "ERROR",
			},
		]);
	});

	it("materializes an exact persisted image-only trigger", async () => {
		const harness = createHarness({
			trigger: triggerMessage({
				content: "",
				attachments: [
					{ id: "image_1", mimeType: "image/png", width: 512, height: 512 },
				],
			}),
			imageData: { image_1: "QUJD" },
		});
		await runHarness(harness);

		assert.deepEqual(harness.requests[0].messages.at(-1)?.content, [
			{
				kind: "image",
				dataUrl: "data:image/png;base64,QUJD",
				detail: "high",
			},
		]);
	});

	it("compacts over-budget history before streaming", async () => {
		const harness = createHarness({
			contextConfig: tinyContextConfig,
			history: overBudgetHistory(),
			modelStream: async (request) =>
				request.purpose === "compaction"
					? tokens(["Summary ", "text."])
					: tokens(["Answer"]),
		});
		assert.deepEqual(await runHarness(harness), [
			{ kind: "thinking" },
			{ kind: "compacting" },
			{ kind: "token", token: "Answer" },
			{ kind: "done" },
		]);
		assert.deepEqual(harness.savedMessages, [
			{
				projectId: "project_1",
				content: "Summary text.",
				type: "SUMMARY",
				createdAt: new Date("2026-01-01T00:00:02Z"),
			},
			{ projectId: "project_1", content: "Answer", type: "RESULT" },
		]);
	});

	it("persists and emits a typed timeout before tokens", async () => {
		const harness = createHarness({
			modelStream: async () => delayedTokens(["Too late"], 20),
			timeoutMs: 1,
			visionTimeoutMs: 1,
		});
		assert.deepEqual(await runHarness(harness), [
			{ kind: "thinking" },
			{ kind: "error", message: "Chat response timed out. Please try again." },
			{ kind: "done" },
		]);
		assert.equal(harness.savedMessages[0].type, "ERROR");
	});

	it("never shortens base timeout for image requests", async () => {
		const harness = createHarness({
			trigger: triggerMessage({
				attachments: [
					{ id: "image_1", mimeType: "image/png", width: 512, height: 512 },
				],
			}),
			imageData: { image_1: "QUJD" },
			modelStream: async () => delayedTokens(["Answer"], 10),
			timeoutMs: 30,
			visionTimeoutMs: 1,
		});
		assert.deepEqual((await runHarness(harness)).map((event) => event.kind), [
			"thinking",
			"token",
			"done",
		]);
	});

	it("turns model failure into one persisted Chat error", async (test) => {
		const errorLog = test.mock.method(console, "error", () => undefined);
		const harness = createHarness({
			modelStream: async () => {
				throw new Error("provider unavailable");
			},
		});
		assert.deepEqual((await runHarness(harness)).map((event) => event.kind), [
			"thinking",
			"error",
			"done",
		]);
		assert.equal(harness.savedMessages.length, 1);
		assert.equal(harness.savedMessages[0].type, "ERROR");
		assert.equal(errorLog.mock.callCount(), 1);
		assert.match(String(errorLog.mock.calls[0].arguments[1]), /provider unavailable/);
	});

	it("defers exactly one partial-result write after disconnect", async () => {
		const controller = new AbortController();
		const deferredTasks: Array<() => Promise<void>> = [];
		const harness = createHarness({
			modelStream: async (_request, signal) => tokenUntilAborted(signal),
			scheduleDeferred: (task) => deferredTasks.push(task),
		});
		const result = await harness.completeChat({
			userId: "user_1",
			projectId: "project_1",
			messageId: "message_1",
			signal: controller.signal,
		});
		assert.equal(result.kind, "started");
		if (result.kind !== "started") return;
		const iterator = result.events[Symbol.asyncIterator]();
		await iterator.next();
		assert.deepEqual(await iterator.next(), {
			value: { kind: "token", token: "Partial" },
			done: false,
		});
		controller.abort();
		assert.deepEqual(await iterator.next(), { value: undefined, done: true });
		assert.equal(deferredTasks.length, 1);
		await deferredTasks[0]();
		assert.deepEqual(harness.savedMessages, [
			{ projectId: "project_1", content: "Partial", type: "RESULT" },
		]);
	});

	it("keeps deferred settlement alive until an in-flight write fails", async (test) => {
		const errorLog = test.mock.method(console, "error", () => undefined);
		const controller = new AbortController();
		const deferredTasks: Array<() => Promise<void>> = [];
		let markSaveStarted!: () => void;
		let rejectSave!: (error: Error) => void;
		const saveStarted = new Promise<void>((resolve) => {
			markSaveStarted = resolve;
		});
		const pendingSave = new Promise<void>((_, reject) => {
			rejectSave = reject;
		});
		const harness = createHarness({
			scheduleDeferred: (task) => deferredTasks.push(task),
			onSaveMessage: async (message) => {
				if (message.type !== "RESULT") return;
				markSaveStarted();
				await pendingSave;
			},
		});
		const result = await harness.completeChat({
			userId: "user_1",
			projectId: "project_1",
			messageId: "message_1",
			signal: controller.signal,
		});
		assert.equal(result.kind, "started");
		if (result.kind !== "started") return;
		const iterator = result.events[Symbol.asyncIterator]();
		await iterator.next();
		await iterator.next();
		await saveStarted;

		controller.abort();
		assert.equal(deferredTasks.length, 1);
		let deferredFinished = false;
		const deferred = deferredTasks[0]().then(() => {
			deferredFinished = true;
		});
		await Promise.resolve();
		assert.equal(deferredFinished, false);

		rejectSave(new Error("database unavailable"));
		await deferred;
		assert.equal(errorLog.mock.callCount(), 1);
		assert.deepEqual(await iterator.next(), { value: undefined, done: true });
	});

	it("continues when provider compaction fails", async (test) => {
		test.mock.method(console, "error", () => undefined);
		const harness = createHarness({
			contextConfig: tinyContextConfig,
			history: overBudgetHistory(),
			modelStream: async (request) => {
				if (request.purpose === "compaction") throw new Error("unavailable");
				return tokens(["Answer"]);
			},
		});
		await runHarness(harness);
		assert.deepEqual(harness.requests.map((request) => request.purpose), [
			"compaction",
			"chat",
		]);
		assert.deepEqual(harness.savedMessages, [
			{ projectId: "project_1", content: "Answer", type: "RESULT" },
		]);
	});

	it("surfaces checkpoint persistence failures", async () => {
		const harness = createHarness({
			contextConfig: tinyContextConfig,
			history: overBudgetHistory(),
			modelStream: async (request) =>
				request.purpose === "compaction"
					? tokens(["Summary"])
					: tokens(["Answer"]),
			onSaveMessage: async (message) => {
				if (message.type === "SUMMARY") throw new Error("database unavailable");
			},
		});
		await assert.rejects(runHarness(harness), /database unavailable/);
		assert.deepEqual(harness.requests.map((request) => request.purpose), [
			"compaction",
		]);
	});

	it("replays existing checkpoint without compacting", async () => {
		const harness = createHarness({
			checkpoint: {
				content: "CHECKPOINT_SUMMARY: user is building a blog.",
				createdAt: new Date("2026-01-01T00:00:00Z"),
			},
		});
		await runHarness(harness);
		assert.deepEqual(harness.requests.map((request) => request.purpose), ["chat"]);
		assert.match(JSON.stringify(harness.requests[0].messages[1]), /CHECKPOINT_SUMMARY/);
	});

	it("persists nothing when stopped before first token", async () => {
		const controller = new AbortController();
		const deferredTasks: Array<() => Promise<void>> = [];
		const harness = createHarness({
			modelStream: async (_request, signal) =>
				(async function* () {
					await waitForAbort(signal);
				})(),
			scheduleDeferred: (task) => deferredTasks.push(task),
		});
		const result = await harness.completeChat({
			userId: "user_1",
			projectId: "project_1",
			messageId: "message_1",
			signal: controller.signal,
		});
		assert.equal(result.kind, "started");
		if (result.kind !== "started") return;
		const iterator = result.events[Symbol.asyncIterator]();
		await iterator.next();
		controller.abort();
		assert.deepEqual(await iterator.next(), { value: undefined, done: true });
		assert.deepEqual(harness.savedMessages, []);
		assert.equal(deferredTasks.length, 1);
		await deferredTasks[0]();
		assert.deepEqual(harness.savedMessages, []);
	});

	it("keeps base64 out of compaction and uses image placeholders", async () => {
		const base64 = "QUJDREVGRw";
		const harness = createHarness({
			contextConfig: tinyContextConfig,
			history: overBudgetHistory([
				{ id: "image_1", mimeType: "image/png", width: 512, height: 512 },
			]),
			imageData: { image_1: base64 },
			modelStream: async (request) =>
				request.purpose === "compaction"
					? tokens(["Summary"])
					: tokens(["Answer"]),
		});
		await runHarness(harness);
		const compactionBody = JSON.stringify(harness.requests[0]);
		assert.doesNotMatch(compactionBody, new RegExp(base64));
		assert.match(compactionBody, /image\/png 512×512/);
	});

	it("counts image tokens toward compaction", async () => {
		const contextConfig = {
			...tinyContextConfig,
			contextTokenBudget: 400,
			reserveOutputTokens: 20,
		};
		const historyFor = (withImage: boolean): ChatHistoryMessage[] => [
			{ role: "USER", content: "b", createdAt: new Date("2026-01-01T00:00:01Z") },
			{
				role: "ASSISTANT",
				content: "c",
				createdAt: new Date("2026-01-01T00:00:02Z"),
			},
			{
				role: "USER",
				content: "a",
				createdAt: new Date("2026-01-01T00:00:03Z"),
				...(withImage
					? {
							attachments: [
								{
									id: "image_1",
									mimeType: "image/png",
									width: 1024,
									height: 1024,
								},
							],
						}
					: {}),
			},
		];
		const withoutImage = createHarness({ contextConfig, history: historyFor(false) });
		const withImage = createHarness({
			contextConfig,
			history: historyFor(true),
			imageData: { image_1: "QUJD" },
			modelStream: async (request) =>
				request.purpose === "compaction"
					? tokens(["Summary"])
					: tokens(["Answer"]),
		});
		await runHarness(withoutImage);
		await runHarness(withImage);
		assert.deepEqual(withoutImage.requests.map((request) => request.purpose), ["chat"]);
		assert.deepEqual(withImage.requests.map((request) => request.purpose), [
			"compaction",
			"chat",
		]);
	});

	it("caps images and degrades remaining images to markers", async () => {
		const history: ChatHistoryMessage[] = [];
		const imageData: Record<string, string> = {};
		for (let index = 0; index < 6; index += 1) {
			const id = `image_${index}`;
			imageData[id] = "QUJD";
			history.push({
				role: "USER",
				content: `Message ${index}`,
				createdAt: new Date(`2026-01-01T00:00:0${index + 1}Z`),
				attachments: [
					{ id, mimeType: "image/png", width: 512, height: 512 },
				],
			});
		}
		const harness = createHarness({
			history,
			imageData,
			contextConfig: { ...DEFAULT_CONTEXT_CONFIG, maxImagesInContext: 2 },
		});
		await runHarness(harness);
		const parts = harness.requests[0].messages.flatMap((message) =>
			Array.isArray(message.content) ? message.content : [],
		);
		assert.equal(parts.filter((part) => part.kind === "image").length, 2);
		assert.equal(
			parts.filter(
				(part) => part.kind === "text" && part.text.startsWith("[image omitted"),
			).length,
			4,
		);
		assert.equal(harness.imageLookups[0].length, 2);
	});
});
