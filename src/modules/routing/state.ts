import { Prisma, type RunStatus } from "@prisma/client";

type RunUpdateArgs = {
	where: {
		id: string;
		status?: RunStatus;
	};
	data: Prisma.RunUpdateInput;
};

type PrismaLike<TRow = unknown> = { // wrap prisma type to avoid importing the entire PrismaClient type we can now pass in tests
	run: { // takes args RunUpdateArgs and returns a promise of TRow
		update: (args: RunUpdateArgs) => Promise<TRow>;
	};
};

export const STATE_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
	waiting_confirmation: ["confirmed", "cancelled"],
	confirmed: ["dispatched", "cancelled"],
	dispatched: ["running", "cancelled"],
	running: ["success", "failed", "cancelled"],
	success: [],
	failed: [],
	cancelled: [],
};

/**
 * Checks whether a run status is final.
 * @param {RunStatus} status - The status to inspect.
 * @returns {boolean} True when the status is success, failed, or cancelled.
 */
export function isTerminal(status: RunStatus): boolean {
	return status === "success" || status === "failed" || status === "cancelled";
}

/**
 * Attempts to transition a run from one status to another.
 * Only updates the row when the current status matches the expected `from` value.
 * Returns `null` when the row no longer matches, such as during a concurrent update.
 * @param {PrismaLike<TRow>} prisma - Prisma-like client with `run.update`.
 * @param {string} runId - The run ID to update.
 * @param {RunStatus} from - The current expected status.
 * @param {RunStatus} to - The new status to write.
 * @param {Prisma.RunUpdateInput} [patch={}] - Additional fields to update.
 * @returns {Promise<TRow | null>} The updated row or `null` if the transition failed.
 */
export async function transition<TRow>(
	prisma: PrismaLike<TRow>, 
	runId: string,
	from: RunStatus,
	to: RunStatus,
	patch: Prisma.RunUpdateInput = {},
): Promise<TRow | null> {
	try {
		return await prisma.run.update({
			where: {
				id: runId,
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
