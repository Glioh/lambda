import type { MessageInput } from "../messages/input.js";
import type { messageRepository } from "../repositories/message.repository.js";
import { ApplicationError } from "../application-error.js";
import { messageAttachments } from "../messages/input.js";

export function messageService(
	repository: ReturnType<typeof messageRepository>,
	chargeCredits: (userId: string, isPro: boolean) => Promise<void>,
) {
	async function requireProject(userId: string, id: string) {
		if (!(await repository.findOwnedProject(userId, id)))
			throw new ApplicationError("NOT_FOUND", "Project not found.");
	}
	return {
		async list(userId: string, projectId: string) {
			await requireProject(userId, projectId);
			return repository.list(userId, projectId);
		},
		async create(userId: string, projectId: string, input: MessageInput, isPro = false) {
			await chargeCredits(userId, isPro);
			await requireProject(userId, projectId);
			const attachments = messageAttachments(input);
			return repository.createWithActivity(projectId, input.value, attachments, new Date());
		},
		async edit(userId: string, projectId: string, messageId: string, input: string, isPro = false) {
			await chargeCredits(userId, isPro);
			await requireProject(userId, projectId);
			return repository.transaction(async tx => {
				const target = await tx.target(projectId, messageId);
				if (!target || target.role !== "USER")
					throw new ApplicationError("INVALID_INPUT", "Only your own messages can be edited.");
				const value = input.trim();
				if (!value && !target.attachments.length)
					throw new ApplicationError("INVALID_INPUT", "Message cannot be empty.");
				await tx.edit(target.id, value);
				await tx.rollback(projectId, target.createdAt, "after");
				await tx.touch(projectId, new Date());
				return { value, hasAttachments: target.attachments.length > 0 };
			});
		},
		async retry(userId: string, projectId: string, messageId: string, isPro = false) {
			await chargeCredits(userId, isPro);
			await requireProject(userId, projectId);
			return repository.transaction(async tx => {
				const target = await tx.target(projectId, messageId);
				if (!target) throw new ApplicationError("INVALID_INPUT", "Message not found.");
				if (target.type === "SUMMARY")
					throw new ApplicationError("INVALID_INPUT", "Compaction checkpoints can't be retried.");
				const prompt =
					target.role === "USER" ? target : await tx.priorPrompt(projectId, target.createdAt);
				if (!prompt) throw new ApplicationError("INVALID_INPUT", "Nothing to retry.");
				await tx.rollback(projectId, target.createdAt, target.role === "USER" ? "after" : "from");
				await tx.touch(projectId, new Date());
				return { value: prompt.content, hasAttachments: prompt.attachments.length > 0 };
			});
		},
	};
}
