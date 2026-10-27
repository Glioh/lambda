import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { usageRepository } from "../../src/database/repositories/usage.repository.js";
import { usageService } from "../../src/services/usage.service.js";

function repository(overrides: Partial<ReturnType<typeof usageRepository>> = {}) {
	return {
		consume: async () => true,
		get: async () => null,
		...overrides,
	} as unknown as ReturnType<typeof usageRepository>;
}

describe("usageService", () => {
	it("uses free and pro point limits", async () => {
		const calls: unknown[][] = [];
		const service = usageService(
			repository({
				consume: async (...args) => {
					calls.push(args);
					return true;
				},
				get: async (...args) => {
					calls.push(args);
					return null;
				},
			}),
			() => false,
		);

		await service.chargeCredits("user-1", false);
		await service.chargeCredits("user-1", true);
		await service.getUsageStatus("user-1", true);

		assert.equal(calls[0][1], 10);
		assert.equal(calls[1][1], 100);
		assert.equal(calls[2][1], 100);
	});

	it("turns exhausted usage into an application error", async () => {
		const service = usageService(repository({ consume: async () => false }), () => false);

		await assert.rejects(
			() => service.chargeCredits("user-1", false),
			error => {
				assert.equal((error as { code: string }).code, "USAGE_LIMIT_EXCEEDED");
				return true;
			},
		);
	});

	it("skips consumption when limits are disabled and propagates failures", async () => {
		let consumed = false;
		const disabled = usageService(
			repository({
				consume: async () => {
					consumed = true;
					return true;
				},
			}),
			() => true,
		);
		await disabled.chargeCredits("user-1", true);
		assert.equal(consumed, false);

		const failure = new Error("database down");
		const service = usageService(
			repository({
				consume: async () => {
					throw failure;
				},
			}),
			() => false,
		);
		await assert.rejects(() => service.chargeCredits("user-1", false), failure);
	});
});
