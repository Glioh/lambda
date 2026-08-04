import { TITLE_PROMPT } from "@/prompt";

/** Small, cheap model — titling is a one-line classification, not a chat turn. */
const TITLE_MODEL = "gpt-4.1-mini";
/** Enough of the opening exchange to name the topic, without paying for the rest. */
const MAX_SOURCE_CHARS = 2000;
const TITLE_TIMEOUT_MS = 8_000;
const MAX_TITLE_TOKENS = 24;
const MAX_TITLE_WORDS = 8;
const MAX_TITLE_CHARS = 60;

export interface TitleSourceMessage {
	role: "USER" | "ASSISTANT";
	content: string;
	/** Lets an image-only opening message still describe itself to the model. */
	hasImage?: boolean;
}

/**
 * Strips the wrapping models habitually add and clamps the length.
 * @param {string} raw - The model's raw output.
 * @returns {string | null} A clean title, or null if nothing usable remains.
 */
export function sanitizeTitle(raw: string): string | null {
	const cleaned = raw
		.replace(/[\r\n]+/g, " ")
		// Leading/trailing quotes, backticks, markdown emphasis, and end punctuation.
		.replace(/^[\s"'`*#]+/, "")
		.replace(/[\s"'`*.!?]+$/, "")
		.replace(/\s+/g, " ")
		.trim();

	if (!cleaned) {
		return null;
	}

	return cleaned
		.split(" ")
		.slice(0, MAX_TITLE_WORDS)
		.join(" ")
		.slice(0, MAX_TITLE_CHARS)
		.trim();
}

/**
 * Renders the opening exchange as a compact transcript for the titler.
 * @param {TitleSourceMessage[]} messages - The first message(s) of the chat.
 * @returns {string} The transcript to summarize into a title.
 */
function buildSource(messages: TitleSourceMessage[]): string {
	return messages
		.map((message) => {
			const speaker = message.role === "ASSISTANT" ? "Assistant" : "User";
			const body = message.content.trim() || (message.hasImage ? "" : "(empty)");
			const image = message.hasImage ? " [shared an image]" : "";

			return `${speaker}: ${body}${image}`;
		})
		.join("\n\n")
		.slice(0, MAX_SOURCE_CHARS);
}

/**
 * Produces a short chat title from the opening exchange.
 *
 * Best-effort by design: every failure path returns null and the caller keeps
 * the generated slug. A missing title is cosmetic; a thrown error here would
 * turn a cosmetic feature into a broken request.
 *
 * @param {TitleSourceMessage[]} messages - The opening exchange.
 * @param {typeof fetch} [fetchImpl] - Injectable for tests.
 * @returns {Promise<string | null>} The title, or null on any failure.
 */
export async function generateChatTitle(
	messages: TitleSourceMessage[],
	fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
	if (messages.length === 0) {
		return null;
	}

	const source = buildSource(messages);

	if (!source.trim()) {
		return null;
	}

	const timeout = AbortSignal.timeout(TITLE_TIMEOUT_MS);

	try {
		const response = await fetchImpl(
			"https://api.openai.com/v1/chat/completions",
			{
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
			},
		);

		if (!response.ok) {
			return null;
		}

		const payload = (await response.json()) as {
			choices?: Array<{ message?: { content?: string | null } }>;
		};

		const raw = payload.choices?.[0]?.message?.content;

		return raw ? sanitizeTitle(raw) : null;
	} catch {
		// Timeout, network failure, or malformed JSON — the slug stands.
		return null;
	}
}
