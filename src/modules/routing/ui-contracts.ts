import type { FailureCategory } from "@prisma/client";

export interface FailureDisplay {
	category: FailureCategory;
	summary: string;
}

export const FAILURE_LABELS: Record<FailureCategory, string> = {
	tool_error: "Tool Error",
	timeout: "Timed Out",
	infra: "Infrastructure Error",
	validation: "Validation Error",
};
