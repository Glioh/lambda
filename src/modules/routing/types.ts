// ─── Mode ───────────────────────────────────────────────────────────
/** Explicit user-selected mode. Omitted = auto-detect. */
export type Mode = "chat" | "build";

// ─── Router Input ───────────────────────────────────────────────────
export interface RoutingInput {
	mode?: "build";
	draftForExecution?: string;
}

// ─── Router Decision ────────────────────────────────────────────────
export type DecisionSource = "auto" | "explicit";
export type RoutingConfidence = "high" | "medium" | "low";

export interface RoutingDecision {
	decision: Mode;
	decisionSource: DecisionSource;
	confidence: RoutingConfidence;
	requiresConfirmation: boolean;
}

// ─── Extended submit payload ────────────────────────────────────────
export interface SubmitInput {
	value: string;
	projectId: string;
	routing?: RoutingInput;
}

// ─── Extended response payload ──────────────────────────────────────
export interface RoutingResponseMeta {
	routing: RoutingDecision;
}
