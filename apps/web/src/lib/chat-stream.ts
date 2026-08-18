"use client";

/** Callbacks receiving incremental chat stream events. */
export interface ChatStreamHandlers {
	/** Called for `event: status` frames (e.g. "thinking", "compacting"). */
	onStatus?: (status: string) => void;
	/** Called for each streamed content token. */
	onToken?: (token: string) => void;
	/** Called for `event: error` frames. */
	onError?: (message: string) => void;
}

/** Controls cancellation and event handling for chat stream consumption. */
export interface ChatStreamOptions {
	/** Aborting this stops generation; the server persists whatever streamed. */
	signal?: AbortSignal;
}

/** Indicates whether the caller aborted the chat stream. */
export interface ChatStreamResult {
	/** True when the caller aborted rather than the stream finishing on its own. */
	stopped: boolean;
}

/** Request payload accepted by chat streaming endpoint. */
export interface ChatStreamInput {
	projectId: string;
	/** Exact persisted user Message whose content and attachments are loaded server-side. */
	messageId: string;
}

/**
 * POSTs to /api/chat and parses the SSE response, invoking a handler per event.
 * Resolves once the stream ends (a `[DONE]` frame or reader completion).
 * Throws when the request cannot be started.
 *
 * @param {ChatStreamInput} input - Persisted Message and target Chat identifiers.
 * @param {ChatStreamHandlers} handlers - Per-event callbacks.
 * @param {ChatStreamOptions} [options] - Abort control for stop-generation.
 * @returns {Promise<ChatStreamResult>} Whether the caller stopped the stream.
 */
export async function streamChatCompletion(
	input: ChatStreamInput,
	handlers: ChatStreamHandlers,
	options?: ChatStreamOptions,
): Promise<ChatStreamResult> {
	let response: Response;

	try {
		response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(input),
			signal: options?.signal,
		});
	} catch (error) {
		// Stopping before the response headers arrive rejects the fetch itself.
		// That's still a normal stop, not a failure to report.
		if (options?.signal?.aborted) {
			return { stopped: true };
		}

		throw error;
	}

	if (!response.ok || !response.body) {
		throw new Error("Unable to start chat response.");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { value: chunk, done } = await reader.read();

			if (done) {
				break;
			}

			buffer += decoder.decode(chunk, { stream: true });
			const events = buffer.split("\n\n");
			buffer = events.pop() ?? "";

			for (const event of events) {
				const lines = event.split("\n");
				const eventName =
					lines.find(line => line.startsWith("event: "))?.slice("event: ".length) ?? "message";
				const data = lines.find(line => line.startsWith("data: "))?.slice("data: ".length);

				if (!data) {
					continue;
				}

				if (data === "[DONE]") {
					return { stopped: false };
				}

				const parsed = JSON.parse(data) as {
					token?: string;
					error?: string;
					status?: string;
				};

				if (eventName === "error") {
					handlers.onError?.(parsed.error ?? "Something went wrong. Please try again.");
					continue;
				}

				if (eventName === "status") {
					if (parsed.status) {
						handlers.onStatus?.(parsed.status);
					}
					continue;
				}

				if (parsed.token) {
					handlers.onToken?.(parsed.token);
				}
			}
		}
	} catch (error) {
		// A user-initiated stop is a normal exit, not a failure to report.
		if (options?.signal?.aborted) {
			return { stopped: true };
		}

		throw error;
	} finally {
		// Tearing the reader down closes the socket, which is how the server
		// learns the client is gone and can abort its upstream request.
		reader.cancel().catch(() => undefined);
	}

	return { stopped: false };
}
