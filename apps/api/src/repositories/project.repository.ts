import type { validateAttachments } from "../attachments/validation.js";
import type { PrismaClient } from "@prisma/client";

const projectSelect = {
	id: true,
	name: true,
	createdAt: true,
	updatedAt: true,
	titleGeneratedAt: true,
} as const;

export function projectRepository(prisma: PrismaClient) {
	return {
		async list(userId: string) {
			return prisma.project.findMany({
				where: { userId },
				orderBy: { updatedAt: "desc" },
				take: 200,
				select: { id: true, name: true, createdAt: true, updatedAt: true },
			});
		},
		async findOwned(userId: string, id: string) {
			return prisma.project.findFirst({ where: { id, userId }, select: projectSelect });
		},
		async create(
			userId: string,
			name: string,
			content: string,
			attachments: ReturnType<typeof validateAttachments>,
		) {
			return prisma.project.create({
				data: {
					userId,
					name,
					messages: {
						create: {
							content,
							role: "USER",
							type: "RESULT",
							...(attachments.length ? { attachments: { create: attachments } } : {}),
						},
					},
				},
				select: projectSelect,
			});
		},
		async rename(userId: string, id: string, name: string, renamedAt: Date) {
			return prisma.project.updateMany({
				where: { id, userId },
				data: { name, titleGeneratedAt: renamedAt },
			});
		},
		async delete(userId: string, id: string) {
			return prisma.project.deleteMany({ where: { id, userId } });
		},
		async claimTitle(userId: string, id: string, claimedAt: Date) {
			return prisma.project.updateMany({
				where: { id, userId, titleGeneratedAt: null },
				data: { titleGeneratedAt: claimedAt },
			});
		},
		async titleSource(projectId: string) {
			return prisma.message.findMany({
				where: { projectId, type: { not: "SUMMARY" } },
				orderBy: { createdAt: "asc" },
				take: 2,
				select: { role: true, content: true, attachments: { select: { id: true }, take: 1 } },
			});
		},
		async saveTitle(userId: string, id: string, name: string, claimedAt: Date) {
			return prisma.project.updateMany({
				where: { id, userId, titleGeneratedAt: claimedAt },
				data: { name },
			});
		},
	};
}
