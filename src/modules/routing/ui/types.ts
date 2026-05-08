import type { RunStatus, FailureCategory } from "@prisma/client";

/** Lightweight run reference returned with messages via getMany include */
export interface MessageRunRef {
	id: string;
	status: RunStatus;
	createdAt: Date;
}

/** Full run data from getRunsForProject query */
export interface RunWithLineage {
	id: string;
	status: RunStatus;
	draftValue: string;
	errorSummary: string | null;
	failureCategory: FailureCategory | null;
	messageId: string | null;
	createdAt: Date;
	dispatchedAt: Date | null;
	startedAt: Date | null;
	completedAt: Date | null;
	auditLogs: {
		action: string;
		actor: string;
		createdAt: Date;
		payload: unknown;
	}[];
}

/** A lineage is a chain: original run + all retries, ordered oldest-first */
export interface RunLineage {
	originalRunId: string;
	messageId: string | null;
	runs: RunWithLineage[];
}
