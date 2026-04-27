import type { RoutingDecision, RoutingInput } from "./types";

/**
 * Build a routing decision from input.
 * When routing input is absent, defaults to build mode (current behavior)
 * to maintain backward compatibility.
 */
export function resolveRoutingDecision(input?: RoutingInput): RoutingDecision {
	if (!input?.mode) {
		return {
			decision: "build",
			decisionSource: "auto",
			confidence: "low",
			requiresConfirmation: false,
		};
	}

	return {
		decision: input.mode,
		decisionSource: "explicit",
		confidence: "high",
		requiresConfirmation: input.mode === "build",
	};
}
