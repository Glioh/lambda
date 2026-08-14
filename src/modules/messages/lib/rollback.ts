import type { MessageType } from "@prisma/client";

/** Database operations required to roll chat back safely. */
export interface RollbackScope {
	createdAt: { gt: Date } | { gte: Date };
}

/**
 * Rows to discard when rolling the chat back to a point.
 *
 * SUMMARY checkpoints are deleted alongside everything else, and that is the
 * whole subtlety here. A checkpoint's `createdAt` is backdated to the newest
 * message it folded, so a checkpoint at or after the boundary summarizes
 * content this rollback is about to delete — replaying it would describe a
 * chat that no longer exists. Deleting it simply promotes the previous
 * checkpoint, whose folded messages all predate the boundary and are untouched;
 * the window just becomes less compact until compaction runs again.
 *
 * Checkpoints *before* the boundary are outside the scope and survive, which is
 * what keeps the chat route's `createdAt > checkpoint` history load correct.
 *
 * @param {Date} boundary - createdAt of the message being rolled back to.
 * @param {"from" | "after"} edge - "from" also deletes the boundary message
 *   itself (retrying an answer replaces it); "after" keeps it (editing or
 *   re-running a user turn preserves the prompt).
 * @returns {RollbackScope} The rows to delete.
 */
export function rollbackScope(
	boundary: Date,
	edge: "from" | "after",
): RollbackScope {
	return edge === "from"
		? { createdAt: { gte: boundary } }
		: { createdAt: { gt: boundary } };
}

/** Message boundary and descendants selected for rollback. */
export interface RollbackCandidate {
	createdAt: Date;
	type: MessageType;
}

/** Message roles a rollback can be anchored to, and which edge each implies. */
export const ROLLBACK_EDGE_BY_ROLE = {
	// Retrying an answer replaces that answer.
	ASSISTANT: "from",
	// Re-running or editing a prompt keeps the prompt itself.
	USER: "after",
} as const;

/**
 * Applies a scope in memory, returning the rows that would survive.
 * Exists so the rules above can be exercised against realistic chat histories without
 * a database.
 *
 * @param {T[]} messages - Chat messages, oldest first.
 * @param {RollbackScope} scope - The scope to apply.
 * @returns {T[]} The surviving messages.
 */
export function survivingMessages<T extends RollbackCandidate>(
	messages: T[],
	scope: RollbackScope,
): T[] {
	return messages.filter((message) =>
		"gt" in scope.createdAt
			? message.createdAt.getTime() <= scope.createdAt.gt.getTime()
			: message.createdAt.getTime() < scope.createdAt.gte.getTime(),
	);
}
