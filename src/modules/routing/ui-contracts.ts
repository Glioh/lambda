import type { FailureCategory, RunStatus } from "@prisma/client";

export const RUN_ACTIONS: Record<RunStatus, readonly string[]> = {
	waiting_confirmation: ["confirm", "cancel", "edit_draft"],
	confirmed: ["cancel"],
	dispatched: ["cancel"],
	running: ["cancel"],
	success: [],
	failed: ["retry"],
	cancelled: ["retry"],
} as const;

export type RunAction = "confirm" | "cancel" | "edit_draft" | "retry";

export function getAvailableActions(status: RunStatus): readonly string[] {
	return RUN_ACTIONS[status];
}

export interface FailureDisplay {
	category: FailureCategory;
	summary: string;
	retryable: boolean;
}

export function isRetryable(status: RunStatus): boolean {
	return status === "failed" || status === "cancelled";
}

export const FAILURE_LABELS: Record<FailureCategory, string> = {
	tool_error: "Tool Error",
	timeout: "Timed Out",
	infra: "Infrastructure Error",
	validation: "Validation Error",
};
