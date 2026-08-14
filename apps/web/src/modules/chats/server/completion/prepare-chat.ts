import {
	SUMMARY_PREAMBLE,
	buildCompactionMessages,
	buildSummaryContextBlock,
	estimateImageTokens,
	estimateMessageTokens,
	estimateTokens,
	planContextWindow,
	type ContextConfig,
} from "@/modules/context";
import { CHAT_PROMPT } from "@/prompt";
import type {
	ChatCompletionContent,
	ChatCompletionRequest,
	ChatHistoryMessage,
	ChatStore,
	PersistedTriggerMessage,
} from "./types";

export interface PreparedChat {
	projectId: string;
	hasImages: boolean;
	compaction: null | {
		request: ChatCompletionRequest;
		checkpointAt?: Date;
	};
	acceptSummary(summary: string): void;
	buildCompletionRequest(): ChatCompletionRequest;
}

const toRole = (role: ChatHistoryMessage["role"]): "user" | "assistant" =>
	role === "ASSISTANT" ? "assistant" : "user";

export async function prepareChat(
	store: ChatStore,
	contextConfig: ContextConfig,
	projectId: string,
	triggerMessage: PersistedTriggerMessage,
): Promise<PreparedChat> {
	const checkpoint = await store.findLatestCheckpoint({
		projectId,
		before: triggerMessage.createdAt,
	});
	const history = await store.findHistory({
		projectId,
		...(checkpoint ? { after: checkpoint.createdAt } : {}),
		before: triggerMessage.createdAt,
		limit: contextConfig.historyFetchCap,
	});
	let summaryContent = checkpoint?.content ?? null;
	const imageTokensFor = (message: ChatHistoryMessage): number =>
		(message.attachments ?? []).reduce(
			(total, attachment) =>
				total + estimateImageTokens(attachment.width, attachment.height),
			0,
		);
	const plan = planContextWindow({
		summaryContent,
		messages: history,
		fixedTokens:
			estimateMessageTokens(CHAT_PROMPT) +
			estimateMessageTokens(triggerMessage.content) +
			imageTokensFor(triggerMessage) +
			(checkpoint ? estimateTokens(SUMMARY_PREAMBLE) : 0),
		config: contextConfig,
		extraTokens: imageTokensFor,
	});
	const selectedImageIds = new Set<string>();

	for (const attachment of triggerMessage.attachments ?? []) {
		if (selectedImageIds.size >= contextConfig.maxImagesInContext) break;
		selectedImageIds.add(attachment.id);
	}

	for (
		let index = plan.tail.length - 1;
		index >= 0 && selectedImageIds.size < contextConfig.maxImagesInContext;
		index -= 1
	) {
		for (const attachment of plan.tail[index].attachments ?? []) {
			if (selectedImageIds.size >= contextConfig.maxImagesInContext) break;
			selectedImageIds.add(attachment.id);
		}
	}

	const imagePayloads = selectedImageIds.size
		? await store.findImagePayloads([...selectedImageIds])
		: [];
	const imageDataUrls = new Map(
		imagePayloads.map((image) => [
			image.id,
			`data:${image.mimeType};base64,${image.data}`,
		]),
	);
	const toContent = (message: ChatHistoryMessage): ChatCompletionContent => {
		const attachments = message.attachments ?? [];
		if (attachments.length === 0) return message.content;

		const parts: Exclude<ChatCompletionContent, string> = [];
		if (message.content.trim()) {
			parts.push({ kind: "text", text: message.content });
		}

		for (const attachment of attachments) {
			const dataUrl = imageDataUrls.get(attachment.id);
			parts.push(
				dataUrl
					? { kind: "image", dataUrl, detail: "high" }
					: {
							kind: "text",
							text: `[image omitted from context: ${attachment.mimeType} ${attachment.width}×${attachment.height}]`,
						},
			);
		}

		return parts;
	};

	return {
		projectId,
		hasImages: selectedImageIds.size > 0,
		compaction: plan.needsCompaction
			? {
					request: {
						purpose: "compaction",
						messages: buildCompactionMessages(summaryContent, plan.head),
						maxTokens: contextConfig.summaryMaxTokens,
					},
					...(plan.head.at(-1)?.createdAt
						? { checkpointAt: plan.head.at(-1)?.createdAt }
						: {}),
				}
			: null,
		acceptSummary(summary) {
			summaryContent = summary;
		},
		buildCompletionRequest() {
			const messages: ChatCompletionRequest["messages"] = [
				{ role: "system", content: CHAT_PROMPT },
			];

			if (summaryContent) {
				messages.push({
					role: "user",
					content: buildSummaryContextBlock(summaryContent),
				});
			}

			for (const message of plan.tail) {
				messages.push({ role: toRole(message.role), content: toContent(message) });
			}

			messages.push({ role: "user", content: toContent(triggerMessage) });
			return { purpose: "chat", messages };
		},
	};
}
