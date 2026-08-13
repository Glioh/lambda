/** Minimal project state used to decide whether chat should auto-start. */
export interface AutoStartState {
	/** The thread currently ends on a USER message. */
	isLastMessageUser: boolean;
	/** A response preview is on screen (streaming, or frozen after a stop). */
	hasStreamingMessage: boolean;
	/** The user pressed stop and hasn't sent anything since. */
	stopped: boolean;
	/** This mount has already kicked off its one automatic stream. */
	hasInitialized: boolean;
}

/**
 * Decides whether the chat view should automatically stream an answer.
 *
 * This exists for the handoff case: the home page creates the project with the
 * first user message and navigates, so the chat view arrives at a thread that
 * ends on a USER message with no answer coming. It starts one.
 *
 * The subtlety — and the source of a real bug — is that a *stopped* turn looks
 * identical: the server persists only what streamed, so an interrupted turn also
 * leaves the thread ending on a USER message. Reading that as "unanswered"
 * re-runs the prompt the user just interrupted. `stopped` is what distinguishes
 * the two, and it is cleared when the user sends again or regenerates.
 *
 * @param {AutoStartState} state - The current view state.
 * @returns {boolean} True when an automatic stream should begin.
 */
export function shouldAutoStartResponse({
	isLastMessageUser,
	hasStreamingMessage,
	stopped,
	hasInitialized,
}: AutoStartState): boolean {
	return (
		isLastMessageUser && !hasStreamingMessage && !stopped && !hasInitialized
	);
}
