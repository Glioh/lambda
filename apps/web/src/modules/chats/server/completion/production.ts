import "server-only";
import { prisma } from "@/lib/db";
import { DEFAULT_CONTEXT_CONFIG } from "@/modules/context";
import { after } from "next/server";
import { OpenAICompletionModel } from "./adapters/openai-completion-model";
import { PrismaChatStore } from "./adapters/prisma-chat-store";
import { createCompleteChat } from "./complete-chat";

const envMs = (name: string, fallback: number): number => {
	const parsed = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const completeChat = createCompleteChat({
	store: new PrismaChatStore(prisma),
	model: new OpenAICompletionModel(),
	contextConfig: DEFAULT_CONTEXT_CONFIG,
	timeoutMs: envMs("CHAT_TIMEOUT_MS", 45_000),
	visionTimeoutMs: envMs("CHAT_VISION_TIMEOUT_MS", 90_000),
	scheduleDeferred: task => after(task),
});
