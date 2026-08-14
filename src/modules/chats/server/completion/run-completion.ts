import type { PreparedChat } from "./prepare-chat";
import type {
	ChatCompletionEvent,
	ChatCompletionModel,
	ChatStore,
} from "./types";

const COMPLETION_ERROR_MESSAGE =
	"Something went wrong while generating the response. Please try again.";
const COMPLETION_TIMEOUT_MESSAGE =
	"Chat response timed out. Please try again.";

class CompletionModelFailure extends Error {
	constructor(cause: unknown) {
		super("Chat completion model failed", { cause });
		this.name = "CompletionModelFailure";
	}
}

class EventQueue implements AsyncIterable<ChatCompletionEvent> {
	private readonly values: ChatCompletionEvent[] = [];
	private readonly waiters: Array<{
		resolve: (result: IteratorResult<ChatCompletionEvent>) => void;
		reject: (error: unknown) => void;
	}> = [];
	private closed = false;
	private failure: unknown;

	push(event: ChatCompletionEvent): void {
		if (this.closed || this.failure) return;
		const waiter = this.waiters.shift();
		if (waiter) waiter.resolve({ value: event, done: false });
		else this.values.push(event);
	}

	close(): void {
		if (this.closed || this.failure) return;
		this.closed = true;
		for (const waiter of this.waiters.splice(0)) {
			waiter.resolve({ value: undefined, done: true });
		}
	}

	fail(error: unknown): void {
		if (this.closed || this.failure) return;
		this.failure = error;
		for (const waiter of this.waiters.splice(0)) waiter.reject(error);
	}

	[Symbol.asyncIterator](): AsyncIterator<ChatCompletionEvent> {
		return {
			next: async () => {
				const value = this.values.shift();
				if (value) return { value, done: false };
				if (this.failure) throw this.failure;
				if (this.closed) return { value: undefined, done: true };
				return new Promise((resolve, reject) =>
					this.waiters.push({ resolve, reject }),
				);
			},
		};
	}
}

function timeoutAfter(milliseconds: number) {
	let timer: ReturnType<typeof setTimeout>;
	const promise = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), milliseconds);
	});
	return { promise, cancel: () => clearTimeout(timer) };
}

export function runChatCompletion(
	prepared: PreparedChat,
	dependencies: {
		store: ChatStore;
		model: ChatCompletionModel;
		timeoutMs: number;
		visionTimeoutMs: number;
		scheduleDeferred(task: () => Promise<void>): void;
	},
	clientSignal: AbortSignal,
): AsyncIterable<ChatCompletionEvent> {
	const events = new EventQueue();
	const modelController = new AbortController();
	let content = "";
	let clientGone = false;
	let terminalPersistence: Promise<void> | null = null;
	const persistOnce = async (
		messageContent: string,
		type: "RESULT" | "ERROR",
	): Promise<void> => {
		if (terminalPersistence) return terminalPersistence;
		const pending = dependencies.store.saveMessage({
			projectId: prepared.projectId,
			content: messageContent,
			type,
		});
		terminalPersistence = pending;
		try {
			await pending;
		} catch (error) {
			if (terminalPersistence === pending) terminalPersistence = null;
			throw error;
		}
	};
	dependencies.scheduleDeferred(async () => {
		if (!clientGone || !content) return;

		try {
			await persistOnce(content, "RESULT");
		} catch (error) {
			console.error("Failed to persist partial Chat response.", error);
		}
	});
	const onClientGone = (): void => {
		if (clientGone) return;
		clientGone = true;
		modelController.abort();
	};
	const runModel = async (): Promise<"completed"> => {
		if (modelController.signal.aborted) {
			throw new DOMException("Chat completion aborted", "AbortError");
		}

		if (prepared.compaction) {
			events.push({ kind: "compacting" });
			let completedSummary: string | null = null;
			try {
				const summaryStream = await dependencies.model.stream(
					prepared.compaction.request,
					modelController.signal,
				);
				let summary = "";
				for await (const token of summaryStream) summary += token;
				completedSummary = summary.trim() || null;
			} catch (error) {
				if (modelController.signal.aborted) throw error;
				console.error(
					"Context compaction failed; continuing without checkpoint update.",
					error,
				);
			}

			if (completedSummary) {
				await dependencies.store.saveMessage({
					projectId: prepared.projectId,
					content: completedSummary,
					type: "SUMMARY",
					...(prepared.compaction.checkpointAt
						? { createdAt: prepared.compaction.checkpointAt }
						: {}),
				});
				prepared.acceptSummary(completedSummary);
			}
		}

		try {
			const stream = await dependencies.model.stream(
				prepared.buildCompletionRequest(),
				modelController.signal,
			);
			for await (const token of stream) {
				content += token;
				events.push({ kind: "token", token });
			}
		} catch (error) {
			throw new CompletionModelFailure(error);
		}
		return "completed";
	};

	events.push({ kind: "thinking" });
	clientSignal.addEventListener("abort", onClientGone, { once: true });
	if (clientSignal.aborted) onClientGone();

	void (async () => {
		try {
			const completion = runModel();
			const timeout = timeoutAfter(
				prepared.hasImages
					? Math.max(dependencies.timeoutMs, dependencies.visionTimeoutMs)
					: dependencies.timeoutMs,
			);
			const outcome = await Promise.race([completion, timeout.promise]).finally(
				timeout.cancel,
			);

			if (outcome === "timeout") {
				modelController.abort();
				void completion.catch(() => undefined);
				if (content) await persistOnce(content, "RESULT");
				else {
					await persistOnce(COMPLETION_TIMEOUT_MESSAGE, "ERROR");
					events.push({ kind: "error", message: COMPLETION_TIMEOUT_MESSAGE });
				}
			} else if (content) await persistOnce(content, "RESULT");
			else if (!clientGone) {
				await persistOnce(COMPLETION_ERROR_MESSAGE, "ERROR");
				events.push({ kind: "error", message: COMPLETION_ERROR_MESSAGE });
			}

			if (!clientGone) events.push({ kind: "done" });
			events.close();
		} catch (error) {
			if (clientGone) {
				events.close();
				return;
			}

			if (error instanceof CompletionModelFailure) {
				console.error("Chat completion model failed.", error.cause);
				try {
					if (content) await persistOnce(content, "RESULT");
					else {
						await persistOnce(COMPLETION_ERROR_MESSAGE, "ERROR");
						events.push({ kind: "error", message: COMPLETION_ERROR_MESSAGE });
					}
					events.push({ kind: "done" });
					events.close();
				} catch (persistenceError) {
					events.fail(persistenceError);
				}
				return;
			}

			events.fail(error);
		} finally {
			clientSignal.removeEventListener("abort", onClientGone);
		}
	})();

	return events;
}
