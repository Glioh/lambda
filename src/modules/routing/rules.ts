import type { ROUTING_RULES } from "./config";

const QUESTION_WORD_PATTERN =
	/^(who|what|when|where|why|how|can|could|would|should|is|are|do|does|did)\b/i;

export function isStructuredBuildIntent(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	return (
		rules.structuredBuildPatterns.some((pattern) => pattern.test(value)) ||
		rules.fencedJsonSpecPattern.test(value)
	);
}

export function isExplicitChatIntent(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	const trimmedValue = value.trim();
	const normalizedValue = trimmedValue.toLowerCase();

	return rules.explicitChatMarkers.some((marker) => {
		const normalizedMarker = marker.toLowerCase();

		if (normalizedMarker === "starts-with-question-word") {
			return QUESTION_WORD_PATTERN.test(trimmedValue);
		}

		if (normalizedMarker === "?") {
			return normalizedValue.includes("?");
		}

		return normalizedValue.startsWith(normalizedMarker);
	});
}
