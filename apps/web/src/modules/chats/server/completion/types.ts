import type { ContextConfig } from "@/modules/context";

export interface CompleteChatInput {
	userId: string;
	projectId: string;
	messageId: string;
	signal: AbortSignal;
}

export type ChatCompletionEvent =
	| { kind: "thinking" }
	| { kind: "compacting" }
	| { kind: "token"; token: string }
	| { kind: "error"; message: string }
	| { kind: "done" };

export type ChatCompletionResult =
	{ kind: "not-found" } | { kind: "started"; events: AsyncIterable<ChatCompletionEvent> };

export interface ChatAttachment {
	id: string;
	mimeType: string;
	width: number;
	height: number;
}

export interface ChatHistoryMessage {
	role: "USER" | "ASSISTANT";
	content: string;
	createdAt: Date;
	attachments?: ChatAttachment[];
}

export interface PersistedTriggerMessage extends ChatHistoryMessage {
	id: string;
	projectId: string;
	type: "RESULT" | "ERROR" | "SUMMARY";
}

export interface ChatStore {
	findProject(input: { projectId: string; userId: string }): Promise<{ id: string } | null>;
	findMessage(messageId: string): Promise<PersistedTriggerMessage | null>;
	findLatestMessage(projectId: string): Promise<{ id: string } | null>;
	findLatestCheckpoint(input: {
		projectId: string;
		before: Date;
	}): Promise<{ content: string; createdAt: Date } | null>;
	findHistory(input: {
		projectId: string;
		after?: Date;
		before: Date;
		limit: number;
	}): Promise<ChatHistoryMessage[]>;
	findImagePayloads(ids: string[]): Promise<Array<{ id: string; mimeType: string; data: string }>>;
	saveMessage(message: {
		projectId: string;
		content: string;
		type: "RESULT" | "ERROR" | "SUMMARY";
		createdAt?: Date;
	}): Promise<void>;
}

export type ChatCompletionContent =
	| string
	| Array<{ kind: "text"; text: string } | { kind: "image"; dataUrl: string; detail: "high" }>;

export interface ChatCompletionRequest {
	purpose: "chat" | "compaction";
	messages: Array<{
		role: "system" | "user" | "assistant";
		content: ChatCompletionContent;
	}>;
	maxTokens?: number;
}

export interface ChatCompletionModel {
	stream(request: ChatCompletionRequest, signal: AbortSignal): Promise<AsyncIterable<string>>;
}

export interface CompleteChatDependencies {
	store: ChatStore;
	model: ChatCompletionModel;
	contextConfig: ContextConfig;
	timeoutMs: number;
	visionTimeoutMs: number;
	scheduleDeferred(task: () => Promise<void>): void;
}

export type CompleteChat = (input: CompleteChatInput) => Promise<ChatCompletionResult>;
