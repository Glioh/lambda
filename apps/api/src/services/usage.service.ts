import type { usageRepository } from "../database/repositories/usage.repository.js";
import { ApplicationError } from "../common/errors.js";

const FREE_POINTS = 10;
const PRO_POINTS = 100;
const DURATION = 30 * 24 * 60 * 60;

export function usageService(
	repository: ReturnType<typeof usageRepository>,
	limitsDisabled: () => boolean,
) {
	return {
		async chargeCredits(userId: string, isPro = false) {
			if (limitsDisabled()) {
				return;
			}

			const consumed = await repository.consume(userId, isPro ? PRO_POINTS : FREE_POINTS, DURATION);

			if (!consumed) {
				throw new ApplicationError("USAGE_LIMIT_EXCEEDED", "Usage limit exceeded.");
			}
		},

		getUsageStatus(userId: string, isPro = false) {
			return repository.get(userId, isPro ? PRO_POINTS : FREE_POINTS, DURATION);
		},
	};
}
