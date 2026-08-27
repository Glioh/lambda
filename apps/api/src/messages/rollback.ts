export type RollbackEdge = "from" | "after";

export function rollbackScope(boundary: Date, edge: RollbackEdge) {
	return edge === "from" ? { createdAt: { gte: boundary } } : { createdAt: { gt: boundary } };
}
