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

/** Flat cost of a `detail: "low"` image. */
export const LOW_DETAIL_IMAGE_TOKENS = 85;
/** Cost of one 512px tile at `detail: "high"`. */
const HIGH_DETAIL_TILE_TOKENS = 170;
const MAX_LONG_EDGE = 2048;
const TARGET_SHORT_EDGE = 768;
const TILE_SIZE = 512;
/** Used when dimensions are unknown; ≈ a 1024×1024 high-detail image. */
export const FALLBACK_IMAGE_TOKENS = 765;

/**
 * Estimates the token cost of a vision image, mirroring the provider's
 * high-detail pricing: fit inside 2048², scale the short edge to 768, then
 * charge per 512px tile plus a flat base.
 *
 * Approximate on purpose, exactly like the chars/4 text heuristic — compaction
 * thresholds only need to be roughly right. Crucially, this works from the
 * stored width/height, so image cost enters the budget without the base64
 * payload ever going near {@link estimateTokens}.
 *
 * @param {number} [width] - Image width in pixels.
 * @param {number} [height] - Image height in pixels.
 * @param {"low" | "high"} [detail] - The detail level the image will be sent at.
 * @returns {number} The estimated token cost.
 */
export function estimateImageTokens(
	width?: number,
	height?: number,
	detail: "low" | "high" = "high",
): number {
	if (detail === "low") {
		return LOW_DETAIL_IMAGE_TOKENS;
	}

	if (!width || !height || width <= 0 || height <= 0) {
		return FALLBACK_IMAGE_TOKENS;
	}

	const fitScale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
	let scaledWidth = width * fitScale;
	let scaledHeight = height * fitScale;

	const shortEdge = Math.min(scaledWidth, scaledHeight);

	if (shortEdge > TARGET_SHORT_EDGE) {
		const shrink = TARGET_SHORT_EDGE / shortEdge;
		scaledWidth *= shrink;
		scaledHeight *= shrink;
	}

	const tiles =
		Math.ceil(scaledWidth / TILE_SIZE) * Math.ceil(scaledHeight / TILE_SIZE);

	return LOW_DETAIL_IMAGE_TOKENS + HIGH_DETAIL_TILE_TOKENS * tiles;
}
