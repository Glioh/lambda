import type { ContextConfig } from "./constants";
import { compactionTriggerTokens } from "./constants";
import { estimateMessageTokens, estimateTokens } from "./tokens";

export interface ContextWindowPlan<T> {
	/** True when the estimated request size exceeds the compaction trigger. */
	needsCompaction: boolean;
	/** Older messages that should be folded into the summary checkpoint. */
	head: T[];
	/** Recent messages kept verbatim in the model request. */
	tail: T[];
	/** Estimated token size of the full request before compaction. */
	estimatedTokens: number;
}

interface PlanContextWindowInput<T> {
	/** Content of the latest summary checkpoint, if one exists. */
	summaryContent: string | null;
	/** Chronological (oldest → newest) history since the last checkpoint. */
	messages: T[];
	/** Token cost of everything else in the request (system prompt, preamble, new user message). */
	fixedTokens: number;
	config: ContextConfig;
}

/**
 * Decides whether the next chat request fits the token budget and, if not,
 * how to split history into a head (to summarize) and a tail (kept verbatim).
 *
 * Mirrors opencode's overflow check: estimate the full request, compare it
 * against `context_limit - reserved_output`, and when over, keep roughly
 * `keepRecentTokens` of the newest messages while folding the rest into a
 * checkpoint. The tail always retains at least `minKeepMessages` messages,
 * and compaction is skipped when there is nothing older to fold.
 */
export function planContextWindow<T extends { content: string }>({
	summaryContent,
	messages,
	fixedTokens,
	config,
}: PlanContextWindowInput<T>): ContextWindowPlan<T> {
	const summaryTokens = summaryContent ? estimateTokens(summaryContent) : 0;
	const historyTokens = messages.reduce(
		(total, message) => total + estimateMessageTokens(message.content),
		0,
	);
	const estimatedTokens = fixedTokens + summaryTokens + historyTokens;

	const overBudget = estimatedTokens > compactionTriggerTokens(config);

	if (!overBudget || messages.length <= config.minKeepMessages) {
		return {
			needsCompaction: false,
			head: [],
			tail: messages,
			estimatedTokens,
		};
	}

	// Walk backward from the newest message, keeping messages verbatim until
	// the tail reaches the keep-recent budget (but always at least minKeepMessages).
	let tailStart = messages.length;
	let tailTokens = 0;

	while (tailStart > 0) {
		const candidate = messages[tailStart - 1];
		const candidateTokens = estimateMessageTokens(candidate.content);
		const mustKeep = messages.length - tailStart < config.minKeepMessages;

		if (!mustKeep && tailTokens + candidateTokens > config.keepRecentTokens) {
			break;
		}

		tailTokens += candidateTokens;
		tailStart -= 1;
	}

	const head = messages.slice(0, tailStart);

	// Nothing older to fold — the recent messages alone exceed the budget.
	// Compacting would be a no-op, so send them as-is.
	if (head.length === 0) {
		return {
			needsCompaction: false,
			head: [],
			tail: messages,
			estimatedTokens,
		};
	}

	return {
		needsCompaction: true,
		head,
		tail: messages.slice(tailStart),
		estimatedTokens,
	};
}
