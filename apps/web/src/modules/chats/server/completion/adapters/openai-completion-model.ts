import "server-only";

import type { ChatCompletionContent, ChatCompletionModel, ChatCompletionRequest } from "../types";

interface OpenAIStreamChunk {
	choices?: Array<{ delta?: { content?: string | null } }>;
	error?: { message?: string };
}

type Fetcher = typeof fetch;

function toOpenAIContent(content: ChatCompletionContent) {
	if (typeof content === "string") return content;

	return content.map(part =>
		part.kind === "text"
			? { type: "text" as const, text: part.text }
			: {
					type: "image_url" as const,
					image_url: { url: part.dataUrl, detail: part.detail },
				},
	);
}

async function* parseOpenAIStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let reachedEnd = false;

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) {
				reachedEnd = true;
				return;
			}

			buffer += decoder.decode(value, { stream: true });
			const events = buffer.split("\n\n");
			buffer = events.pop() ?? "";

			for (const event of events) {
				for (const line of event.split("\n")) {
					if (!line.startsWith("data: ")) continue;
					const data = line.slice("data: ".length).trim();
					if (!data) continue;
					if (data === "[DONE]") return;

					const chunk = JSON.parse(data) as OpenAIStreamChunk;
					if (chunk.error) {
						throw new Error(chunk.error.message ?? "OpenAI Chat stream failed.");
					}
					const token = chunk.choices?.[0]?.delta?.content;
					if (token) yield token;
				}
			}
		}
	} finally {
		if (!reachedEnd) await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}

export class OpenAICompletionModel implements ChatCompletionModel {
	constructor(
		private readonly fetcher: Fetcher = fetch,
		private readonly apiKey = process.env.OPENAI_API_KEY ?? "",
		private readonly model = "gpt-4.1",
	) {}

	async stream(request: ChatCompletionRequest, signal: AbortSignal) {
		if (!this.apiKey) {
			throw new Error("OPENAI_API_KEY is not configured.");
		}

		const response = await this.fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.model,
				messages: request.messages.map(message => ({
					role: message.role,
					content: toOpenAIContent(message.content),
				})),
				stream: true,
				...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
			}),
			signal,
		});

		if (!response.ok || !response.body) {
			const detail = response.ok
				? "response body missing"
				: await response.text().catch(() => "response body unavailable");
			throw new Error(
				`OpenAI Chat completion request failed (${response.status}): ${detail.slice(0, 500)}`,
			);
		}

		return parseOpenAIStream(response.body);
	}
}
