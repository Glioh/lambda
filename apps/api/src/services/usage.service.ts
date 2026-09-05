import type { usageRepository } from "../repositories/usage.repository.js";

const FREE_POINTS = 10;
const PRO_POINTS = 100;
const DURATION = 30 * 24 * 60 * 60;

export function usageService(
	repository: ReturnType<typeof usageRepository>,
	limitsDisabled: () => boolean,
) {
	return {
		async chargeCredits(userId: string, isPro = false) {
			if (limitsDisabled()) return;
			await repository.consume(userId, isPro ? PRO_POINTS : FREE_POINTS, DURATION);
		},
		getUsageStatus(userId: string, isPro = false) {
			return repository.get(userId, isPro ? PRO_POINTS : FREE_POINTS, DURATION);
		},
	};
}
