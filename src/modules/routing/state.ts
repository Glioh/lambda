import { Prisma, type PendingRunStatus } from "@prisma/client";

type PendingRunUpdateArgs = {
	where: {
		id: string;
		status?: PendingRunStatus;
	};
	data: Prisma.PendingRunUpdateInput;
};

type PrismaLike<TRow = unknown> = {
	pendingRun: {
		update: (args: PendingRunUpdateArgs) => Promise<TRow>;
	};
};

export const STATE_TRANSITIONS: Record<PendingRunStatus, PendingRunStatus[]> = {
	clarification_required: ["waiting_confirmation", "cancelled"],
	waiting_confirmation: ["confirmed", "cancelled"],
	confirmed: ["dispatched"],
	dispatched: [],
	cancelled: [],
};

export function isTerminal(status: PendingRunStatus): boolean {
	return status === "dispatched" || status === "cancelled";
}

export async function transition<TRow>(
	prisma: PrismaLike<TRow>,
	pendingRunId: string,
	from: PendingRunStatus,
	to: PendingRunStatus,
	patch: Prisma.PendingRunUpdateInput = {},
): Promise<TRow | null> {
	try {
		return await prisma.pendingRun.update({
			where: {
				id: pendingRunId,
				status: from,
			},
			data: {
				status: to,
				...patch,
			},
		});
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError ||
			(error && typeof error === "object" && "code" in error)
		) {
			const code = (error as { code?: unknown }).code;
			if (code === "P2025") {
				return null;
			}
		}

		throw error;
	}
}
