import { Prisma } from "@prisma/client";

/**
 * Actions that can be recorded in the routing audit log.
 */
export type RoutingAuditAction =
	| "create"
	| "edit_draft"
	| "confirm"
	| "cancel"
	| "dispatch";

type PrismaLike<TRow = unknown> = {
	routingAuditLog: {
		create: (args: {
			data: {
				pendingRunId: string;
				action: RoutingAuditAction;
				actor: string;
				payload?: Prisma.InputJsonValue;
			};
		}) => Promise<TRow>;
	};
};

interface LogAuditEventInput {
	pendingRunId: string;
	action: RoutingAuditAction;
	actor: string;
	payload?: unknown;
}

/**
 * Writes a routing audit log entry.
 * @param {PrismaLike<TRow>} prisma - Prisma-like client with `routingAuditLog.create`.
 * @param {LogAuditEventInput} input - The audit event data to persist.
 * @returns {Promise<TRow>} The created audit log row.
 */
export async function logAuditEvent<TRow>(
	prisma: PrismaLike<TRow>,
	{ pendingRunId, action, actor, payload }: LogAuditEventInput,
): Promise<TRow> {
	return prisma.routingAuditLog.create({
		data: {
			pendingRunId,
			action,
			actor,
			...(payload === undefined
				? {}
				: { payload: payload as Prisma.InputJsonValue }),
		},
	});
}
