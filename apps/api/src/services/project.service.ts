import type { MessageInput } from "../contracts/messages/create-message.js";
import type { projectsRepository } from "../database/repositories/projects.repository.js";
import type { TitleSourceMessage } from "../integrations/title-generator.js";
import { AttachmentValidationError, validateAttachments } from "../attachments.js";
import { ApplicationError } from "../common/errors.js";

export function deriveDefaultTitle(content: string) {
	const words = content.trim().split(/\s+/).filter(Boolean);
	return words.slice(0, 10).join(" ") || "New project";
}

export function projectService(
	repository: ReturnType<typeof projectsRepository>,
	chargeCredits: (userId: string, isPro: boolean) => Promise<void>,
	title: (messages: TitleSourceMessage[]) => Promise<string | null>,
) {
	return {
		list(userId: string) {
			return repository.list(userId);
		},

		async get(userId: string, id: string) {
			const project = await repository.findById(userId, id);

			if (!project) {
				throw new ApplicationError("NOT_FOUND", "Project not found.");
			}
			return project;
		},

		async create(userId: string, input: MessageInput, isPro = false) {
			await chargeCredits(userId, isPro);

			const attachments = validateMessageAttachments(input);

			return repository.create(userId, deriveDefaultTitle(input.value), input.value, attachments);
		},

		async rename(userId: string, id: string, input: string) {
			const name = input.trim();

			if (!name || name.length > 100) {
				throw new ApplicationError(
					"INVALID_INPUT",
					name ? "Name is too long." : "Name cannot be empty.",
				);
			}

			const result = await repository.rename(userId, id, name);
			if (!result.count) {
				if (!(await repository.findById(userId, id))) {
					throw new ApplicationError("NOT_FOUND", "Project not found.");
				}
				throw new ApplicationError("CONFLICT", "Project title is still being generated.");
			}
			return { id, name };
		},

		async delete(userId: string, id: string) {
			if (!(await repository.delete(userId, id)).count) {
				throw new ApplicationError("NOT_FOUND", "Project not found.");
			}
			return { id };
		},

		async generateTitle(userId: string, id: string) {
			// ponytail: concurrent calls may both generate; only the first agentRename wins.
			// Deduplicate callers if duplicate generation becomes common.
			const context = await repository.getTitleContext(userId, id);
			if (!context) {
				return null;
			}

			const name = await title(
				context.map(message => ({
					role: message.role,
					content: message.content,
					hasImage: message.attachments.length > 0,
				})),
			).catch(() => null);

			const result = await repository.agentRename(userId, id, name);
			if (!result.count) {
				return null;
			}
			return name ? { id, name } : null;
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
