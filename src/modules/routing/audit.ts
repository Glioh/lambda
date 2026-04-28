import { Prisma } from "@prisma/client";

export type RoutingAuditAction =
	| "create"
	| "request_clarification"
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

export async function logAuditEvent<TRow>(
	prisma: PrismaLike<TRow>,
	{ pendingRunId, action, actor, payload }: LogAuditEventInput,
): Promise<TRow> {
	return prisma.routingAuditLog.create({
		data: {
			pendingRunId,
			action,
			actor,
			...(payload === undefined ? {} : { payload: payload as Prisma.InputJsonValue }),
		},
	});
}
