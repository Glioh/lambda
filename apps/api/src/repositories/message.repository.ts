import type { validateAttachments } from "../attachments/validation.js";
import type { RollbackEdge } from "../messages/rollback.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import { rollbackScope } from "../messages/rollback.js";

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

function messageTransaction(tx: Prisma.TransactionClient) {
	return {
		async target(projectId: string, id: string) {
			return tx.message.findFirst({
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
			return tx.message.findFirst({
				where: { projectId, role: "USER", createdAt: { lt: before } },
				orderBy: { createdAt: "desc" },
				select: { content: true, attachments: { select: { id: true }, take: 1 } },
			});
		},
		async edit(id: string, content: string) {
			return tx.message.update({ where: { id }, data: { content } });
		},
		async rollback(projectId: string, boundary: Date, edge: RollbackEdge) {
			return tx.message.deleteMany({ where: { projectId, ...rollbackScope(boundary, edge) } });
		},
		async touch(id: string, updatedAt: Date) {
			return tx.project.update({ where: { id }, data: { updatedAt } });
		},
	};
}

export function messageRepository(prisma: PrismaClient) {
	return {
		async findOwnedProject(userId: string, id: string) {
			return prisma.project.findFirst({ where: { id, userId }, select: { id: true } });
		},
		async list(userId: string, projectId: string) {
			return prisma.message.findMany({
				where: { projectId, project: { userId } },
				orderBy: [{ createdAt: "asc" }, { type: "asc" }],
				select: messageSelect,
			});
		},
		async createWithActivity(
			projectId: string,
			content: string,
			attachments: ReturnType<typeof validateAttachments>,
			updatedAt: Date,
		) {
			const [message] = await prisma.$transaction([
				prisma.message.create({
					data: {
						projectId,
						content,
						role: "USER",
						type: "RESULT",
						...(attachments.length ? { attachments: { create: attachments } } : {}),
					},
					select: messageSelect,
				}),
				prisma.project.update({ where: { id: projectId }, data: { updatedAt } }),
			]);
			return message;
		},
		transaction<T>(work: (transaction: ReturnType<typeof messageTransaction>) => Promise<T>) {
			return prisma.$transaction(tx => work(messageTransaction(tx)));
		},
	};
}
