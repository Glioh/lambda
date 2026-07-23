"use client";

export interface ChatStreamHandlers {
	/** Called for `event: status` frames (e.g. "thinking", "compacting"). */
	onStatus?: (status: string) => void;
	/** Called for each streamed content token. */
	onToken?: (token: string) => void;
	/** Called for `event: error` frames. */
	onError?: (message: string) => void;
}

/**
 * POSTs to /api/chat and parses the SSE response, invoking a handler per event.
 * Resolves once the stream ends (a `[DONE]` frame or reader completion).
 * Throws when the request cannot be started.
 */
export async function streamChatCompletion(
	input: { value: string; projectId: string },
	handlers: ChatStreamHandlers,
): Promise<void> {
	const response = await fetch("/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(input),
	});

	if (!response.ok || !response.body) {
		throw new Error("Unable to start chat response.");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

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
				lines
					.find((line) => line.startsWith("event: "))
					?.slice("event: ".length) ?? "message";
			const data = lines
				.find((line) => line.startsWith("data: "))
				?.slice("data: ".length);

			if (!data) {
				continue;
			}

			if (data === "[DONE]") {
				return;
			}

			const parsed = JSON.parse(data) as {
				token?: string;
				error?: string;
				status?: string;
			};

			if (eventName === "error") {
				handlers.onError?.(
					parsed.error ?? "Something went wrong. Please try again.",
				);
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
}
