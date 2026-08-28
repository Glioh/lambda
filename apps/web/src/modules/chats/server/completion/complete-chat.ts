import type { CompleteChat, CompleteChatDependencies, CompleteChatInput } from "./types";
import { prepareChat } from "./prepare-chat";
import { runChatCompletion } from "./run-completion";

export function createCompleteChat(dependencies: CompleteChatDependencies): CompleteChat {
	return async ({ userId, projectId, messageId, signal }) => {
		const project = await dependencies.store.findProject({ projectId, userId });
		if (!project) return { kind: "not-found" };

		const [triggerMessage, latestMessage] = await Promise.all([
			dependencies.store.findMessage(messageId),
			dependencies.store.findLatestMessage(projectId),
		]);

		if (
			!triggerMessage ||
			latestMessage?.id !== triggerMessage.id ||
			triggerMessage.projectId !== project.id ||
			triggerMessage.role !== "USER" ||
			triggerMessage.type !== "RESULT"
		) {
			return { kind: "not-found" };
		}

		const prepared = await prepareChat(
			dependencies.store,
			dependencies.contextConfig,
			projectId,
			triggerMessage,
		);

		return {
			kind: "started",
			events: runChatCompletion(prepared, dependencies, signal),
		};
	};
}

export type { CompleteChatInput };
export type * from "./types";
