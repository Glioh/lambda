import { Prisma, type PendingRunStatus } from "@prisma/client";

type PendingRunUpdateArgs = {
	where: {
		id: string;
		status?: PendingRunStatus;
	};
	data: Prisma.PendingRunUpdateInput;
};

type PrismaLike<TRow = unknown> = { // wrap prisma type to avoid importing the entire PrismaClient type we can now pass in tests
	pendingRun: { // takes args PendingRunUpdateArgs and returns a promise of TRow
		update: (args: PendingRunUpdateArgs) => Promise<TRow>;
	};
};

export const STATE_TRANSITIONS: Partial<
	Record<PendingRunStatus, PendingRunStatus[]>
> = {
	waiting_confirmation: ["confirmed", "cancelled"],
	confirmed: ["dispatched"],
	dispatched: [],
	cancelled: [],
};

/**
 * Checks whether a pending run status is final.
 * @param {PendingRunStatus} status - The status to inspect.
 * @returns {boolean} True when the status is dispatched or cancelled.
 */
export function isTerminal(status: PendingRunStatus): boolean {
	return status === "dispatched" || status === "cancelled";
}

/**
 * Attempts to transition a pending run from one status to another.
 * Only updates the row when the current status matches the expected `from` value.
 * Returns `null` when the row no longer matches, such as during a concurrent update.
 * @param {PrismaLike<TRow>} prisma - Prisma-like client with `pendingRun.update`.
 * @param {string} pendingRunId - The pending run ID to update.
 * @param {PendingRunStatus} from - The current expected status.
 * @param {PendingRunStatus} to - The new status to write.
 * @param {Prisma.PendingRunUpdateInput} [patch={}] - Additional fields to update.
 * @returns {Promise<TRow | null>} The updated row or `null` if the transition failed.
 */
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
