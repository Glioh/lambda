/**
 * Rough per-message token overhead for chat formatting (role markers, separators).
 * OpenAI's chat format costs a few tokens of scaffolding per message.
 */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Estimates the token count of a string using the ~4 characters/token heuristic.
 * This mirrors opencode, which also estimates rather than running a tokenizer —
 * compaction thresholds only need to be approximately right.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Estimates the token cost of a single chat message including format overhead.
 */
export function estimateMessageTokens(content: string): number {
	return estimateTokens(content) + PER_MESSAGE_OVERHEAD_TOKENS;
}

/**
 * Estimates the total token cost of a list of message contents.
 */
export function estimateMessagesTokens(contents: string[]): number {
	return contents.reduce(
		(total, content) => total + estimateMessageTokens(content),
		0,
	);
}
