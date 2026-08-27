import { TITLE_PROMPT } from "./title-prompt.js";

const TITLE_MODEL = "gpt-4.1-mini";
const MAX_SOURCE_CHARS = 2_000;
const TITLE_TIMEOUT_MS = 8_000;
const MAX_TITLE_TOKENS = 24;
const MAX_TITLE_WORDS = 8;
const MAX_TITLE_CHARS = 60;

export interface TitleSourceMessage {
	role: "USER" | "ASSISTANT";
	content: string;
	hasImage?: boolean;
}

export function sanitizeTitle(raw: string): string | null {
	const cleaned = raw
		.replace(/[\r\n]+/g, " ")
		.replace(/^[\s"'`*#]+/, "")
		.replace(/[\s"'`*.!?]+$/, "")
		.replace(/\s+/g, " ")
		.trim();

	if (!cleaned) return null;

	return cleaned.split(" ").slice(0, MAX_TITLE_WORDS).join(" ").slice(0, MAX_TITLE_CHARS).trim();
}

function buildSource(messages: TitleSourceMessage[]): string {
	return messages
		.map(message => {
			const speaker = message.role === "ASSISTANT" ? "Assistant" : "User";
			const body = message.content.trim() || (message.hasImage ? "" : "(empty)");
			const image = message.hasImage ? " [shared an image]" : "";

			return `${speaker}: ${body}${image}`;
		})
		.join("\n\n")
		.slice(0, MAX_SOURCE_CHARS);
}

export async function generateChatTitle(
	messages: TitleSourceMessage[],
	fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
	if (messages.length === 0) return null;

	const source = buildSource(messages);
	if (!source.trim()) return null;

	const timeout = AbortSignal.timeout(TITLE_TIMEOUT_MS);

	try {
		const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
			},
			body: JSON.stringify({
				model: TITLE_MODEL,
				messages: [
					{ role: "system", content: TITLE_PROMPT },
					{ role: "user", content: source },
				],
				max_tokens: MAX_TITLE_TOKENS,
				temperature: 0.3,
			}),
			signal: timeout,
		});

		if (!response.ok) {
			console.warn(`Chat title generation failed: ${response.status} ${response.statusText}`);
			return null;
		}

		const payload = (await response.json()) as {
			choices?: Array<{ message?: { content?: string | null } }>;
		};
		const raw = payload.choices?.[0]?.message?.content;

		if (!raw) {
			console.warn("Chat title generation returned no content.");
			return null;
		}

		return sanitizeTitle(raw);
	} catch (error) {
		console.warn("Chat title generation errored.", error);
		return null;
	}
}
