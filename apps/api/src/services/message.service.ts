import type { MessageInput } from "../contracts/messages/create-message.js";
import type { Database } from "../database/database.js";
import { AttachmentValidationError, validateAttachments } from "../attachments.js";
import { ApplicationError } from "../common/errors.js";

export function messageService(
	database: Pick<Database, "messages" | "projects" | "transaction">,
	chargeCredits: (userId: string, isPro: boolean) => Promise<void>,
) {
	async function requireProject(userId: string, id: string) {
		if (!(await database.projects.findById(userId, id))) {
			throw new ApplicationError("NOT_FOUND", "Project not found.");
		}
	}

	return {
		async list(userId: string, projectId: string) {
			await requireProject(userId, projectId);

			return database.messages.list(userId, projectId);
		},

		async create(userId: string, projectId: string, input: MessageInput, isPro = false) {
			await chargeCredits(userId, isPro);
			await requireProject(userId, projectId);

			const attachments = validateMessageAttachments(input);

			return database.transaction(async ({ messages, projects }) => {
				const message = await messages.create(projectId, input.value, attachments);
				await projects.touch(projectId, new Date());
				return message;
			});
		},

		async edit(userId: string, projectId: string, messageId: string, input: string, isPro = false) {
			await chargeCredits(userId, isPro);
			await requireProject(userId, projectId);

			return database.transaction(async ({ messages, projects }) => {
				const target = await messages.target(projectId, messageId);

				if (!target || target.role !== "USER") {
					throw new ApplicationError("INVALID_INPUT", "Only your own messages can be edited.");
				}

				const value = input.trim();

				if (!value && !target.attachments.length) {
					throw new ApplicationError("INVALID_INPUT", "Message cannot be empty.");
				}

				await messages.edit(target.id, value);
				await messages.deleteMessagesFrom(projectId, target.createdAt, { inclusive: false });
				await projects.touch(projectId, new Date());

				return { value, hasAttachments: target.attachments.length > 0 };
			});
		},

		async retry(userId: string, projectId: string, messageId: string, isPro = false) {
			await chargeCredits(userId, isPro);
			await requireProject(userId, projectId);

			return database.transaction(async ({ messages, projects }) => {
				const target = await messages.target(projectId, messageId);

				if (!target) {
					throw new ApplicationError("INVALID_INPUT", "Message not found.");
				}

				if (target.type === "SUMMARY") {
					throw new ApplicationError("INVALID_INPUT", "Compaction checkpoints can't be retried.");
				}

				const prompt =
					target.role === "USER" ? target : await messages.priorPrompt(projectId, target.createdAt);

				if (!prompt) {
					throw new ApplicationError("INVALID_INPUT", "Nothing to retry.");
				}

				await messages.deleteMessagesFrom(projectId, target.createdAt, {
					inclusive: target.role !== "USER", // Delete if the message being retried belongs to agent
				});
				await projects.touch(projectId, new Date());

				return { value: prompt.content, hasAttachments: prompt.attachments.length > 0 };
			});
		},
	};
}

function validateMessageAttachments(input: MessageInput) {
	if (!input.value.trim() && !input.attachments?.length) {
		throw new ApplicationError("INVALID_INPUT", "Message cannot be empty.");
	}

	try {
		return validateAttachments(input.attachments ?? []);
	} catch (error) {
		throw new ApplicationError(
			"INVALID_INPUT",
			error instanceof AttachmentValidationError ? error.message : "Attachments are invalid.",
		);
	}
}
