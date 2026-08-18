import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	scheduleAutoStartResponse,
	shouldAutoStartResponse,
	type AutoStartState,
} from "@/modules/projects/lib/auto-start";

/** The home-page handoff: an unanswered chat on a fresh mount. */
const handoff: AutoStartState = {
	isLastMessageUser: true,
	hasStreamingMessage: false,
	stopped: false,
	hasInitialized: false,
};

describe("shouldAutoStartResponse", () => {
	it("starts a response for the home-page handoff", () => {
		assert.equal(shouldAutoStartResponse(handoff), true);
	});

	it("does NOT restart after the user stops generation", () => {
		// The regression this function exists for. A stopped turn leaves the chat
		// ending on a USER message with no preview on screen — identical to the
		// handoff except for `stopped`. Without that flag the interrupted prompt
		// was immediately re-run and answered again.
		assert.equal(shouldAutoStartResponse({ ...handoff, stopped: true }), false);
	});

	it("does NOT restart when a stop happened via the composer", () => {
		// The composer path never sets hasInitialized, so `stopped` is the only
		// thing standing between a stop and an unwanted re-answer.
		assert.equal(
			shouldAutoStartResponse({
				isLastMessageUser: true,
				hasStreamingMessage: false,
				stopped: true,
				hasInitialized: false,
			}),
			false,
		);
	});

	it("does not start while a response is already on screen", () => {
		assert.equal(shouldAutoStartResponse({ ...handoff, hasStreamingMessage: true }), false);
	});

	it("does not start twice on the same mount", () => {
		assert.equal(shouldAutoStartResponse({ ...handoff, hasInitialized: true }), false);
	});

	it("does not start when the chat already ends on an answer", () => {
		assert.equal(shouldAutoStartResponse({ ...handoff, isLastMessageUser: false }), false);
	});

	it("starts again once a stop is cleared by a new send", () => {
		// Sending (or regenerating) clears `stopped`, re-arming the handoff path.
		const afterStop = { ...handoff, stopped: true };
		assert.equal(shouldAutoStartResponse(afterStop), false);
		assert.equal(shouldAutoStartResponse({ ...afterStop, stopped: false }), true);
	});
});

describe("scheduleAutoStartResponse", () => {
	it("does not start a Strict Mode probe cleaned up in the same task", async () => {
		let starts = 0;
		const cancel = scheduleAutoStartResponse(() => starts++);

		cancel();
		await Promise.resolve();

		assert.equal(starts, 0);
	});

	it("starts once when the effect lifecycle survives cleanup", async () => {
		let starts = 0;
		scheduleAutoStartResponse(() => starts++);

		await Promise.resolve();

		assert.equal(starts, 1);
	});
});
