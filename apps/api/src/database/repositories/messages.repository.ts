import type { ValidatedAttachment } from "../../attachments.js";
import type { DatabaseClient } from "../client.js";

const messageSelect = {
	id: true,
	content: true,
	role: true,
	type: true,
	createdAt: true,
	updatedAt: true,
	attachments: {
		select: { id: true, mimeType: true, width: true, height: true },
		orderBy: { createdAt: "asc" as const },
	},
} as const;

export function messagesRepository(db: DatabaseClient) {
	return {
		async list(userId: string, projectId: string) {
			return db.message.findMany({
				where: { projectId, project: { userId } },
				orderBy: [{ createdAt: "asc" }, { type: "asc" }],
				select: messageSelect,
			});
		},

		async create(projectId: string, content: string, attachments: ValidatedAttachment[]) {
			return db.message.create({
				data: {
					projectId,
					content,
					role: "USER",
					type: "RESULT",
					...(attachments.length ? { attachments: { create: attachments } } : {}),
				},
				select: messageSelect,
			});
		},

		async target(projectId: string, id: string) {
			return db.message.findFirst({
				where: { id, projectId },
				select: {
					id: true,
					role: true,
					type: true,
					createdAt: true,
					content: true,
					attachments: { select: { id: true }, take: 1 },
				},
			});
		},

		async priorPrompt(projectId: string, before: Date) {
			return db.message.findFirst({
				where: { projectId, role: "USER", createdAt: { lt: before } },
				orderBy: { createdAt: "desc" },
				select: { content: true, attachments: { select: { id: true }, take: 1 } },
			});
		},

		async edit(id: string, content: string) {
			return db.message.update({ where: { id }, data: { content } });
		},

		async deleteMessagesFrom(
			projectId: string,
			boundary: Date,
			{ inclusive }: { inclusive: boolean },
		) {
			return db.message.deleteMany({
				where: { projectId, createdAt: inclusive ? { gte: boundary } : { gt: boundary } },
			});
		},
	};
}
