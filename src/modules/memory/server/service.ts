/** Represents the persisted role of a thread message. */
export type ThreadMemoryRole = "USER" | "ASSISTANT";

/** A single persisted chat message in the current project thread. */
export interface ThreadMemoryMessage {
	id?: string;
	role: ThreadMemoryRole;
	content: string;
	type?: string | null;
	createdAt?: Date | string | null;
}

/** A selected working file included in thread memory context. */
export interface ThreadMemoryFile {
	path: string;
	content: string;
	truncated: boolean;
}

/** Metadata for the latest artifact version used in thread memory. */
export interface ThreadMemoryArtifactVersion {
	id?: string;
	version: number;
	runId?: string | null;
	sandboxUrl: string | null;
	title: string | null;
	createdAt: Date | string;
	files: ThreadMemoryArtifactFile[];
}

/** A file entry belonging to a persisted artifact version. */
export interface ThreadMemoryArtifactFile {
	path: string;
	content: string;
}

/** Cached state for an existing conversation summary. */
export interface ThreadMemorySummaryState {
	content?: string | null;
	lastMessageId?: string | null;
	updatedAt?: Date | string | null;
}

/** Budget metadata for the assembled thread memory context. */
export interface ThreadMemoryBudget {
	maxChars: number;
	usedChars: number;
	truncated: boolean;
	omittedRecentMessages: number;
	omittedWorkingFiles: number;
	truncatedWorkingFiles: number;
}

/** Refresh decision metadata for the current thread summary. */
export interface ThreadMemorySummaryRefresh {
	shouldRefresh: boolean;
	reason: "missing" | "message_threshold" | "age_threshold" | "fresh";
	unsummarizedMessageCount: number;
	nextRefreshAfterMessages: number;
}

/** The assembled thread memory payload used to build prompt context. */
export interface ThreadMemoryPack {
	recentMessages: ThreadMemoryMessage[];
	conversationSummary: string;
	activeArtifactSummary: string;
	selectedWorkingFiles: ThreadMemoryFile[];
	summaryRefresh: ThreadMemorySummaryRefresh;
	budget: ThreadMemoryBudget;
}

/** Runtime options for thread memory assembly. */
export interface ThreadMemoryOptions {
	recentMessageLimit?: number;
	messageFetchLimit?: number;
	maxContextChars?: number;
	maxConversationSummaryChars?: number;
	maxArtifactSummaryChars?: number;
	selectedWorkingFileLimit?: number;
	maxWorkingFileChars?: number;
	summaryRefreshMessageThreshold?: number;
	summaryRefreshMaxAgeMs?: number;
}

interface NormalizedThreadMemoryOptions {
	recentMessageLimit: number;
	messageFetchLimit: number;
	maxContextChars: number;
	maxConversationSummaryChars: number;
	maxArtifactSummaryChars: number;
	selectedWorkingFileLimit: number;
	maxWorkingFileChars: number;
	summaryRefreshMessageThreshold: number;
	summaryRefreshMaxAgeMs: number;
}

export interface AssembleThreadMemoryInput {
	projectId: string;
	currentUserMessage?: string;
	summaryState?: ThreadMemorySummaryState;
	options?: ThreadMemoryOptions;
	now?: Date;
}

export interface AssembleThreadMemoryPartsInput {
	messages: ThreadMemoryMessage[];
	artifactVersion?: ThreadMemoryArtifactVersion | null;
	currentUserMessage?: string;
	summaryState?: ThreadMemorySummaryState;
	options?: ThreadMemoryOptions;
	now?: Date;
}

export interface ThreadMemoryPrismaClient {
	message: {
		findMany: (args: {
			where: { projectId: string };
			orderBy: { createdAt: "desc" };
			take: number;
			select: {
				id: true;
				role: true;
				content: true;
				type: true;
				createdAt: true;
			};
		}) => Promise<ThreadMemoryMessage[]>;
	};
	artifactVersion: {
		findFirst: (args: {
			where: { artifact: { projectId: string } };
			orderBy: Array<{ version: "desc" } | { createdAt: "desc" }>;
			include: { files: { orderBy: { path: "asc" } } };
		}) => Promise<ThreadMemoryArtifactVersion | null>;
	};
}

const EMPTY_CONVERSATION_SUMMARY =
	"No earlier thread messages outside the recent context window.";
const EMPTY_ARTIFACT_SUMMARY = "No active artifact version is available.";
const MIN_RECENT_MESSAGE_LIMIT = 10;
const MAX_RECENT_MESSAGE_LIMIT = 20;

const DEFAULT_OPTIONS: NormalizedThreadMemoryOptions = {
	recentMessageLimit: MAX_RECENT_MESSAGE_LIMIT,
	messageFetchLimit: 50,
	maxContextChars: 24_000,
	maxConversationSummaryChars: 4_000,
	maxArtifactSummaryChars: 1_200,
	selectedWorkingFileLimit: 6,
	maxWorkingFileChars: 2_000,
	summaryRefreshMessageThreshold: 8,
	summaryRefreshMaxAgeMs: 30 * 60 * 1000,
};

/**
 * Builds a complete thread-level memory pack from persisted project messages
 * and the latest artifact version.
 * @param {ThreadMemoryPrismaClient} prisma - Prisma-shaped data client.
 * @param {AssembleThreadMemoryInput} input - Thread and budget inputs.
 * @returns {Promise<ThreadMemoryPack>} The bounded thread memory context pack.
 */
export async function assembleThreadMemory(
	prisma: ThreadMemoryPrismaClient,
	input: AssembleThreadMemoryInput,
): Promise<ThreadMemoryPack> {
	const options = normalizeOptions(input.options);
	const [messages, artifactVersion] = await Promise.all([
		prisma.message.findMany({
			where: { projectId: input.projectId },
			orderBy: { createdAt: "desc" },
			take: options.messageFetchLimit,
			select: {
				id: true,
				role: true,
				content: true,
				type: true,
				createdAt: true,
			},
		}),
		prisma.artifactVersion.findFirst({
			where: { artifact: { projectId: input.projectId } },
			orderBy: [{ version: "desc" }, { createdAt: "desc" }],
			include: { files: { orderBy: { path: "asc" } } },
		}),
	]);

	return assembleThreadMemoryFromParts({
		messages: messages.reverse(),
		artifactVersion,
		currentUserMessage: input.currentUserMessage,
		summaryState: input.summaryState,
		options,
		now: input.now,
	});
}

/**
 * Builds a thread-level memory pack from already loaded messages and artifact
 * data. This pure assembly path keeps summarization refresh decisions cheap and
 * testable.
 * @param {AssembleThreadMemoryPartsInput} input - Loaded thread memory parts.
 * @returns {ThreadMemoryPack} The bounded thread memory context pack.
 */
export function assembleThreadMemoryFromParts(
	input: AssembleThreadMemoryPartsInput,
): ThreadMemoryPack {
	const options = normalizeOptions(input.options);
	const messages = appendCurrentUserMessage(
		input.messages.filter((message) => message.content.trim().length > 0),
		input.currentUserMessage,
	);
	const recentMessages = messages.slice(-options.recentMessageLimit);
	const olderMessages = messages.slice(0, -options.recentMessageLimit);
	const summaryRefresh = getSummaryRefresh({
		messages,
		summaryState: input.summaryState,
		options,
		now: input.now ?? new Date(),
	});
	const conversationSummary =
		trimToBudget(input.summaryState?.content ?? "", options.maxConversationSummaryChars)
			.value ||
		summarizeMessages(olderMessages, options.maxConversationSummaryChars);
	const activeArtifactSummary = summarizeArtifactVersion(
		input.artifactVersion,
		options.maxArtifactSummaryChars,
	);
	const selectedWorkingFiles = selectWorkingFiles(
		input.artifactVersion?.files ?? [],
		options,
	);

	return enforceContextBudget(
		{
			recentMessages,
			conversationSummary,
			activeArtifactSummary,
			selectedWorkingFiles,
			summaryRefresh,
			budget: {
				maxChars: options.maxContextChars,
				usedChars: 0,
				truncated: false,
				omittedRecentMessages: 0,
				omittedWorkingFiles: 0,
				truncatedWorkingFiles: selectedWorkingFiles.filter((file) => file.truncated)
					.length,
			},
		},
		options,
	);
}

/**
 * Renders a thread memory pack as a compact prompt section for model context.
 * @param {ThreadMemoryPack} pack - Bounded thread memory context pack.
 * @returns {string} Prompt-ready thread context text.
 */
export function renderThreadMemoryContext(pack: ThreadMemoryPack): string {
	const files =
		pack.selectedWorkingFiles.length > 0
			? pack.selectedWorkingFiles
					.map((file) => {
						const suffix = file.truncated ? "\n[truncated]" : "";
						return `File: ${file.path}\n${file.content}${suffix}`;
					})
					.join("\n\n")
			: "No selected working files.";

	return [
		"Thread-level memory context. Use this only for the current project thread; do not infer any project-level or user-level global memory.",
		`Conversation summary:\n${pack.conversationSummary}`,
		`Active artifact summary:\n${pack.activeArtifactSummary}`,
		`Selected working files:\n${files}`,
		`Context budget: ${pack.budget.usedChars}/${pack.budget.maxChars} chars${pack.budget.truncated ? " (truncated)" : ""}.`,
	].join("\n\n");
}

/**
 * Converts a persisted message role into a compact transcript label.
 * @param {ThreadMemoryRole} role - Persisted thread message role.
 * @returns {string} Human-readable transcript role label.
 */
function formatRole(role: ThreadMemoryRole) {
	return role === "ASSISTANT" ? "Assistant" : "User";
}

/**
 * Adds the in-flight user message when it has not been persisted in the recent
 * thread history yet.
 * @param {ThreadMemoryMessage[]} messages - Chronological thread messages.
 * @param {string | undefined} currentUserMessage - In-flight user message.
 * @returns {ThreadMemoryMessage[]} Messages including the current user turn.
 */
function appendCurrentUserMessage(
	messages: ThreadMemoryMessage[],
	currentUserMessage?: string,
) {
	const content = currentUserMessage?.trim();
	if (!content) {
		return messages;
	}

	const lastMessage = messages[messages.length - 1];
	if (lastMessage?.role === "USER" && lastMessage.content === content) {
		return messages;
	}

	return [
		...messages,
		{
			role: "USER" as const,
			content,
			createdAt: new Date(),
		},
	];
}

/**
 * Normalizes caller options and clamps recent-message count to the Phase 1
 * thread-level range.
 * @param {ThreadMemoryOptions | undefined} options - Partial memory options.
 * @returns {NormalizedThreadMemoryOptions} Complete normalized options.
 */
function normalizeOptions(
	options?: ThreadMemoryOptions | NormalizedThreadMemoryOptions,
): NormalizedThreadMemoryOptions {
	const recentMessageLimit = clamp(
		options?.recentMessageLimit ?? DEFAULT_OPTIONS.recentMessageLimit,
		MIN_RECENT_MESSAGE_LIMIT,
		MAX_RECENT_MESSAGE_LIMIT,
	);

	return {
		recentMessageLimit,
		messageFetchLimit: Math.max(
			recentMessageLimit,
			options?.messageFetchLimit ?? DEFAULT_OPTIONS.messageFetchLimit,
		),
		maxContextChars: Math.max(
			2_000,
			options?.maxContextChars ?? DEFAULT_OPTIONS.maxContextChars,
		),
		maxConversationSummaryChars: Math.max(
			500,
			options?.maxConversationSummaryChars ??
				DEFAULT_OPTIONS.maxConversationSummaryChars,
		),
		maxArtifactSummaryChars: Math.max(
			250,
			options?.maxArtifactSummaryChars ?? DEFAULT_OPTIONS.maxArtifactSummaryChars,
		),
		selectedWorkingFileLimit: Math.max(
			0,
			options?.selectedWorkingFileLimit ?? DEFAULT_OPTIONS.selectedWorkingFileLimit,
		),
		maxWorkingFileChars: Math.max(
			250,
			options?.maxWorkingFileChars ?? DEFAULT_OPTIONS.maxWorkingFileChars,
		),
		summaryRefreshMessageThreshold: Math.max(
			1,
			options?.summaryRefreshMessageThreshold ??
				DEFAULT_OPTIONS.summaryRefreshMessageThreshold,
		),
		summaryRefreshMaxAgeMs: Math.max(
			1,
			options?.summaryRefreshMaxAgeMs ?? DEFAULT_OPTIONS.summaryRefreshMaxAgeMs,
		),
	};
}

/**
 * Clamps a numeric value within an inclusive range.
 * @param {number} value - Value to clamp.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @returns {number} Clamped value.
 */
function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Builds an extractive summary from older thread messages without invoking a
 * model on the first-token path.
 * @param {ThreadMemoryMessage[]} messages - Messages outside the recent window.
 * @param {number} maxChars - Maximum summary size.
 * @returns {string} Bounded conversation summary.
 */
function summarizeMessages(messages: ThreadMemoryMessage[], maxChars: number) {
	if (messages.length === 0) {
		return EMPTY_CONVERSATION_SUMMARY;
	}

	const transcript = messages
		.map((message) => `${formatRole(message.role)}: ${collapseWhitespace(message.content)}`)
		.join("\n");

	return trimToBudget(transcript, maxChars).value;
}

/**
 * Builds a compact summary of the active artifact version.
 * @param {ThreadMemoryArtifactVersion | null | undefined} artifactVersion - Latest artifact version.
 * @param {number} maxChars - Maximum summary size.
 * @returns {string} Bounded artifact summary.
 */
function summarizeArtifactVersion(
	artifactVersion: ThreadMemoryArtifactVersion | null | undefined,
	maxChars: number,
) {
	if (!artifactVersion) {
		return EMPTY_ARTIFACT_SUMMARY;
	}

	const files = artifactVersion.files.map((file) => file.path);
	const summary = [
		`Version ${artifactVersion.version}${artifactVersion.title ? `: ${artifactVersion.title}` : ""}.`,
		`${files.length} files in the active artifact.`,
		`Files: ${files.join(", ") || "none"}.`,
	].join(" ");

	return trimToBudget(summary, maxChars).value;
}

/**
 * Selects a small set of likely useful artifact files for working context.
 * @param {ThreadMemoryArtifactFile[]} files - Artifact files to rank.
 * @param {NormalizedThreadMemoryOptions} options - Selection and size options.
 * @returns {ThreadMemoryFile[]} Bounded selected files.
 */
function selectWorkingFiles(
	files: ThreadMemoryArtifactFile[],
	options: NormalizedThreadMemoryOptions,
) {
	return [...files]
		.sort((left, right) => rankFilePath(right.path) - rankFilePath(left.path))
		.slice(0, options.selectedWorkingFileLimit)
		.map((file) => {
			const trimmed = trimToBudget(file.content, options.maxWorkingFileChars);
			return {
				path: file.path,
				content: trimmed.value,
				truncated: trimmed.truncated,
			};
		});
}

/**
 * Scores artifact file paths so source and project entry files are preferred.
 * @param {string} path - Artifact file path.
 * @returns {number} Relative selection score.
 */
function rankFilePath(path: string) {
	let score = 0;

	if (path === "package.json") {
		score += 50;
	}
	if (path.startsWith("src/app/")) {
		score += 40;
	}
	if (path.startsWith("src/components/")) {
		score += 30;
	}
	if (path.startsWith("src/modules/")) {
		score += 25;
	}
	if (/\.(tsx|ts|css|json)$/.test(path)) {
		score += 10;
	}

	return score;
}

/**
 * Computes whether the thread summary should be refreshed.
 * @param {{ messages: ThreadMemoryMessage[]; summaryState?: ThreadMemorySummaryState; options: NormalizedThreadMemoryOptions; now: Date; }} input - Refresh inputs.
 * @returns {ThreadMemorySummaryRefresh} Refresh decision metadata.
 */
function getSummaryRefresh({
	messages,
	summaryState,
	options,
	now,
}: {
	messages: ThreadMemoryMessage[];
	summaryState?: ThreadMemorySummaryState;
	options: NormalizedThreadMemoryOptions;
	now: Date;
}): ThreadMemorySummaryRefresh {
	const lastSummaryIndex = summaryState?.lastMessageId
		? messages.findIndex((message) => message.id === summaryState.lastMessageId)
		: -1;
	const unsummarizedMessageCount =
		lastSummaryIndex >= 0 ? messages.length - lastSummaryIndex - 1 : messages.length;
	const updatedAt =
		summaryState?.updatedAt instanceof Date
			? summaryState.updatedAt
			: summaryState?.updatedAt
				? new Date(summaryState.updatedAt)
				: null;
	const isStaleByAge = updatedAt
		? now.getTime() - updatedAt.getTime() >= options.summaryRefreshMaxAgeMs
		: false;

	if (!summaryState?.content && messages.length > options.recentMessageLimit) {
		return {
			shouldRefresh: true,
			reason: "missing",
			unsummarizedMessageCount,
			nextRefreshAfterMessages: options.summaryRefreshMessageThreshold,
		};
	}

	if (unsummarizedMessageCount >= options.summaryRefreshMessageThreshold) {
		return {
			shouldRefresh: true,
			reason: "message_threshold",
			unsummarizedMessageCount,
			nextRefreshAfterMessages: options.summaryRefreshMessageThreshold,
		};
	}

	if (isStaleByAge) {
		return {
			shouldRefresh: true,
			reason: "age_threshold",
			unsummarizedMessageCount,
			nextRefreshAfterMessages: options.summaryRefreshMessageThreshold,
		};
	}

	return {
		shouldRefresh: false,
		reason: "fresh",
		unsummarizedMessageCount,
		nextRefreshAfterMessages: options.summaryRefreshMessageThreshold,
	};
}

/**
 * Enforces the total context budget by dropping low-priority files first, then
 * reducing older recent messages only when needed.
 * @param {ThreadMemoryPack} pack - Initial memory pack.
 * @param {NormalizedThreadMemoryOptions} options - Budget options.
 * @returns {ThreadMemoryPack} Budgeted memory pack.
 */
function enforceContextBudget(
	pack: ThreadMemoryPack,
	options: NormalizedThreadMemoryOptions,
): ThreadMemoryPack {
	let budgetedPack = { ...pack };
	let usedChars = estimateContextChars(budgetedPack);
	let omittedWorkingFiles = 0;
	let omittedRecentMessages = 0;

	while (
		usedChars > options.maxContextChars &&
		budgetedPack.selectedWorkingFiles.length > 0
	) {
		budgetedPack = {
			...budgetedPack,
			selectedWorkingFiles: budgetedPack.selectedWorkingFiles.slice(0, -1),
		};
		omittedWorkingFiles += 1;
		usedChars = estimateContextChars(budgetedPack);
	}

	while (
		usedChars > options.maxContextChars &&
		budgetedPack.recentMessages.length > MIN_RECENT_MESSAGE_LIMIT
	) {
		budgetedPack = {
			...budgetedPack,
			recentMessages: budgetedPack.recentMessages.slice(1),
		};
		omittedRecentMessages += 1;
		usedChars = estimateContextChars(budgetedPack);
	}

	if (usedChars > options.maxContextChars) {
		const fixedChars =
			budgetedPack.conversationSummary.length +
			budgetedPack.activeArtifactSummary.length;
		const perMessageBudget = Math.max(
			120,
			Math.floor(
				(options.maxContextChars - fixedChars) /
					Math.max(1, budgetedPack.recentMessages.length),
			),
		);
		budgetedPack = {
			...budgetedPack,
			recentMessages: budgetedPack.recentMessages.map((message) => ({
				...message,
				content: trimToBudget(message.content, perMessageBudget).value,
			})),
		};
		usedChars = estimateContextChars(budgetedPack);
	}

	return {
		...budgetedPack,
		budget: {
			maxChars: options.maxContextChars,
			usedChars,
			truncated:
				pack.budget.truncated ||
				omittedWorkingFiles > 0 ||
				omittedRecentMessages > 0 ||
				usedChars > options.maxContextChars,
			omittedRecentMessages,
			omittedWorkingFiles,
			truncatedWorkingFiles: budgetedPack.selectedWorkingFiles.filter(
				(file) => file.truncated,
			).length,
		},
	};
}

/**
 * Estimates prompt context size using character count as a stable token-budget
 * proxy for tests and request guards.
 * @param {ThreadMemoryPack} pack - Memory pack to estimate.
 * @returns {number} Estimated context characters.
 */
function estimateContextChars(pack: ThreadMemoryPack) {
	return (
		pack.conversationSummary.length +
		pack.activeArtifactSummary.length +
		pack.recentMessages.reduce((sum, message) => sum + message.content.length, 0) +
		pack.selectedWorkingFiles.reduce((sum, file) => sum + file.content.length, 0)
	);
}

/**
 * Trims a string to the requested size and marks whether content was removed.
 * @param {string} value - Input text.
 * @param {number} maxChars - Maximum returned length.
 * @returns {{ value: string; truncated: boolean }} Trimmed value metadata.
 */
function trimToBudget(value: string, maxChars: number) {
	if (value.length <= maxChars) {
		return { value, truncated: false };
	}

	return {
		value: `${value.slice(0, Math.max(0, maxChars - 16)).trimEnd()}\n[truncated]`,
		truncated: true,
	};
}

/**
 * Collapses repeated whitespace in user or assistant text for compact summaries.
 * @param {string} value - Text to normalize.
 * @returns {string} Single-line normalized text.
 */
function collapseWhitespace(value: string) {
	return value.replace(/\s+/g, " ").trim();
}
