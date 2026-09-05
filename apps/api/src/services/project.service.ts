import type { MessageInput } from "../messages/input.js";
import type { TitleSourceMessage } from "../projects/title.js";
import type { projectRepository } from "../repositories/project.repository.js";
import { generateSlug } from "random-word-slugs";
import { ApplicationError } from "../application-error.js";
import { messageAttachments } from "../messages/input.js";

export function projectService(
	repository: ReturnType<typeof projectRepository>,
	chargeCredits: (userId: string, isPro: boolean) => Promise<void>,
	title: (messages: TitleSourceMessage[]) => Promise<string | null>,
) {
	return {
		list: (userId: string) => repository.list(userId),
		async get(userId: string, id: string) {
			const project = await repository.findOwned(userId, id);
			if (!project) throw new ApplicationError("NOT_FOUND", "Project not found.");
			return project;
		},
		async create(userId: string, input: MessageInput, isPro = false) {
			await chargeCredits(userId, isPro);
			const attachments = messageAttachments(input);
			return repository.create(
				userId,
				generateSlug(2, { format: "kebab" }),
				input.value,
				attachments,
			);
		},
		async rename(userId: string, id: string, input: string) {
			const name = input.trim();
			if (!name || name.length > 100)
				throw new ApplicationError(
					"INVALID_INPUT",
					name ? "Name is too long." : "Name cannot be empty.",
				);
			const result = await repository.rename(userId, id, name, new Date());
			if (!result.count) throw new ApplicationError("NOT_FOUND", "Project not found.");
			return { id, name };
		},
		async delete(userId: string, id: string) {
			if (!(await repository.delete(userId, id)).count)
				throw new ApplicationError("NOT_FOUND", "Project not found.");
			return { id };
		},
		async generateTitle(userId: string, id: string) {
			const claimedAt = new Date();
			if (!(await repository.claimTitle(userId, id, claimedAt)).count) return null;
			const source = await repository.titleSource(id);
			const name = await title(
				source.map(message => ({
					role: message.role,
					content: message.content,
					hasImage: message.attachments.length > 0,
				})),
			);
			if (!name) return null;
			return (await repository.saveTitle(userId, id, name, claimedAt)).count ? { id, name } : null;
		},
	};
}
