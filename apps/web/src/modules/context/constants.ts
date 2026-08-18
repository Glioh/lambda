/**
 * Configuration for the chat context window and compaction.
 * Demo-scale defaults so compaction is easy to observe during development.
 * Every value can be overridden with an environment variable.
 */
export interface ContextConfig {
	/** Total token budget for a chat request (system prompt + summary + history + new message). */
	contextTokenBudget: number;
	/** Tokens reserved for the model's response; compaction triggers at budget - reserve. */
	reserveOutputTokens: number;
	/** Approximate token mass of recent messages kept verbatim after compaction. */
	keepRecentTokens: number;
	/** Cap on the summarizer's output length, passed as max_tokens. */
	summaryMaxTokens: number;
	/** The tail always keeps at least this many messages, regardless of size. */
	minKeepMessages: number;
	/** Safety cap on how many messages are fetched from the database. */
	historyFetchCap: number;
	/**
	 * How many of the newest images in the verbatim tail are actually sent to the
	 * model. Older ones degrade to a text marker — images are the most expensive
	 * thing in the window, and a long chat containing screenshots would otherwise
	 * crowd out the chat itself.
	 */
	maxImagesInContext: number;
}

const envInt = (name: string, fallback: number): number => {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}

	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
	contextTokenBudget: envInt("CONTEXT_TOKEN_BUDGET", 4000),
	reserveOutputTokens: envInt("CONTEXT_RESERVE_OUTPUT_TOKENS", 800),
	keepRecentTokens: envInt("CONTEXT_KEEP_RECENT_TOKENS", 1500),
	summaryMaxTokens: envInt("CONTEXT_SUMMARY_MAX_TOKENS", 600),
	minKeepMessages: envInt("CONTEXT_MIN_KEEP_MESSAGES", 2),
	historyFetchCap: envInt("CONTEXT_HISTORY_FETCH_CAP", 200),
	maxImagesInContext: envInt("CONTEXT_MAX_IMAGES", 4),
};

/**
 * Validates cross-field invariants that per-field parsing can't catch.
 * Individually positive values can still describe an impossible budget
 * (e.g. reserve >= total), which would push the compaction trigger to zero
 * or negative and make it fire on every message. Fail fast instead.
 * @throws {Error} When the config describes an unusable budget.
 */
export function validateContextConfig(config: ContextConfig): ContextConfig {
	if (config.reserveOutputTokens >= config.contextTokenBudget) {
		throw new Error(
			`Invalid context config: reserveOutputTokens (${config.reserveOutputTokens}) must be less than contextTokenBudget (${config.contextTokenBudget}).`,
		);
	}

	// envInt already floors this at a positive value, so this only catches a
	// hand-constructed config — but a zero here would silently drop every image
	// from the context rather than failing loudly.
	if (!Number.isInteger(config.maxImagesInContext) || config.maxImagesInContext < 1) {
		throw new Error(
			`Invalid context config: maxImagesInContext (${config.maxImagesInContext}) must be a positive integer.`,
		);
	}

	return config;
}

// Validate the process-wide default at module load so misconfiguration fails at boot.
validateContextConfig(DEFAULT_CONTEXT_CONFIG);

/**
 * The token estimate at which compaction triggers, mirroring opencode's
 * `context_limit - reserved_output` overflow check.
 */
export function compactionTriggerTokens(config: ContextConfig): number {
	return config.contextTokenBudget - config.reserveOutputTokens;
}
