import { createHash } from "node:crypto";
import { ROUTING_RULES, isStructuredBuildIntent } from "./rules";
import type { RoutingDecision, RoutingInput } from "./types";

type RuleHit = "explicit_build" | "structured_build" | "fallback";

interface DecideRouteInput {
	value: string;
	routing?: RoutingInput;
	projectId?: string;
}

export function decideRoute(
	input: DecideRouteInput,
	logger: (entry: object) => void = (entry) =>
		console.log(JSON.stringify(entry)),
): RoutingDecision {
	if (input.routing?.mode === "build") {
		return logAndReturn(input, logger, "explicit_build", {
			decision: "build",
			decisionSource: "explicit",
			confidence: "high",
			requiresConfirmation: true,
		});
	}

	if (isStructuredBuildIntent(input.value, ROUTING_RULES)) {
		return logAndReturn(input, logger, "structured_build", {
			decision: "build",
			decisionSource: "auto",
			confidence: "high",
			requiresConfirmation: true,
		});
	}

	return logAndReturn(input, logger, "fallback", {
		decision: "chat",
		decisionSource: "auto",
		confidence: "low",
		requiresConfirmation: false,
	});
}

function logAndReturn(
	input: DecideRouteInput,
	logger: (entry: object) => void,
	ruleHit: RuleHit,
	decision: RoutingDecision,
): RoutingDecision {
	logger({
		event: "routing_decision",
		projectId: input.projectId,
		messageHash: createHash("sha256")
			.update(input.value)
			.digest("hex")
			.slice(0, 12),
		decision: decision.decision,
		decisionSource: decision.decisionSource,
		confidence: decision.confidence,
		requiresConfirmation: decision.requiresConfirmation,
		ruleHit,
		ts: new Date().toISOString(),
	});

	return decision;
}
