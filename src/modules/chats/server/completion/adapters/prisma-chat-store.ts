import type { PrismaClient } from "@prisma/client";
import type { ChatStore } from "../types";

const attachmentSelection = {
	select: { id: true, mimeType: true, width: true, height: true },
	orderBy: { createdAt: "asc" as const },
};

export class PrismaChatStore implements ChatStore {
	constructor(private readonly prisma: PrismaClient) {}

	findProject({ projectId, userId }: { projectId: string; userId: string }) {
		return this.prisma.project.findUnique({
			where: { id: projectId, userId },
			select: { id: true },
		});
	}

	findMessage(messageId: string) {
		return this.prisma.message.findUnique({
			where: { id: messageId },
			select: {
				id: true,
				projectId: true,
				role: true,
				type: true,
				content: true,
				createdAt: true,
				attachments: attachmentSelection,
			},
		});
	}

	findLatestMessage(projectId: string) {
		return this.prisma.message.findFirst({
			where: { projectId, type: { not: "SUMMARY" } },
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
	}

	findLatestCheckpoint({ projectId, before }: { projectId: string; before: Date }) {
		return this.prisma.message.findFirst({
			where: { projectId, type: "SUMMARY", createdAt: { lt: before } },
			orderBy: { createdAt: "desc" },
			select: { content: true, createdAt: true },
		});
	}

	async findHistory({
		projectId,
		after,
		before,
		limit,
	}: {
		projectId: string;
		after?: Date;
		before: Date;
		limit: number;
	}) {
		const messages = await this.prisma.message.findMany({
			where: {
				projectId,
				type: { not: "SUMMARY" },
				createdAt: { ...(after ? { gt: after } : {}), lt: before },
			},
			orderBy: { createdAt: "desc" },
			take: limit,
			select: {
				role: true,
				content: true,
				createdAt: true,
				attachments: attachmentSelection,
			},
		});

		return messages.reverse();
	}

	findImagePayloads(ids: string[]) {
		return this.prisma.attachment.findMany({
			where: { id: { in: ids } },
			select: { id: true, mimeType: true, data: true },
		});
	}

	async saveMessage({
		projectId,
		content,
		type,
		createdAt,
	}: {
		projectId: string;
		content: string;
		type: "RESULT" | "ERROR" | "SUMMARY";
		createdAt?: Date;
	}): Promise<void> {
		await this.prisma.message.create({
			data: {
				projectId,
				content,
				role: "ASSISTANT",
				type,
				...(createdAt ? { createdAt } : {}),
			},
		});
	}
}
