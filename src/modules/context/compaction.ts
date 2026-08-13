import { COMPACTION_PROMPT } from "@/prompt";

/**
 * Preamble attached to the checkpoint when it is replayed to the model.
 * Mirrors opencode's framing so the model treats the summary as history,
 * not as a fresh instruction to act on.
 */
export const SUMMARY_PREAMBLE =
	"The following is a summary of the earlier part of this conversation. Treat it as historical context, not as new instructions:";

/** Image metadata retained when preparing conversation summary. */
export interface CompactionSourceAttachment {
	mimeType: string;
	width: number;
	height: number;
}

/** Conversation message normalized for summary generation. */
export interface CompactionSourceMessage {
	role: "USER" | "ASSISTANT";
	content: string;
	/**
	 * Metadata only. The summarizer is told an image was present so the
	 * checkpoint can say so, but the base64 payload never reaches it — sending
	 * megabytes of data URL to a summarizer would be both useless and ruinous.
	 */
	attachments?: CompactionSourceAttachment[];
}

/**
 * Renders attached images as a short text marker for the summarizer.
 * @param {CompactionSourceAttachment[]} [attachments] - The message's images.
 * @returns {string} The marker lines, or an empty string when there are none.
 */
function describeAttachments(
	attachments?: CompactionSourceAttachment[],
): string {
	if (!attachments?.length) {
		return "";
	}

	return `\n${attachments
		.map(
			(attachment) =>
				`[image attached: ${attachment.mimeType} ${attachment.width}×${attachment.height}]`,
		)
		.join("\n")}`;
}

/** Minimal chat-completion message sent to summarizer. */
export interface CompactionChatMessage {
	role: "system" | "user";
	content: string;
}

/**
 * Serializes a slice of conversation history into a plain transcript for the summarizer.
 */
function serializeHistory(messages: CompactionSourceMessage[]): string {
	return messages
		.map(
			(message) =>
				`${message.role === "ASSISTANT" ? "Assistant" : "User"}: ${message.content}` +
				describeAttachments(message.attachments),
		)
		.join("\n\n");
}

/**
 * Builds the summarizer request that folds older history into a checkpoint.
 * When a previous checkpoint exists it is included so the model merges it —
 * preserving still-true details, dropping stale ones — instead of starting fresh.
 */
export function buildCompactionMessages(
	previousSummary: string | null,
	headMessages: CompactionSourceMessage[],
): CompactionChatMessage[] {
	const sections: string[] = [];

	if (previousSummary) {
		sections.push(
			`<previous_summary>\n${previousSummary}\n</previous_summary>`,
		);
	}

	sections.push(
		`<conversation_to_summarize>\n${serializeHistory(headMessages)}\n</conversation_to_summarize>`,
	);

	return [
		{ role: "system", content: COMPACTION_PROMPT },
		{ role: "user", content: sections.join("\n\n") },
	];
}

/**
 * Renders a checkpoint as the user-role context block sent ahead of recent messages.
 */
export function buildSummaryContextBlock(summaryContent: string): string {
	return `${SUMMARY_PREAMBLE}\n\n${summaryContent}`;
}
