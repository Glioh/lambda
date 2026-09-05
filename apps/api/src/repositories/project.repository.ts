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
		list: async (userId: string) =>
			prisma.project.findMany({
				where: { userId },
				orderBy: { updatedAt: "desc" },
				take: 200,
				select: { id: true, name: true, createdAt: true, updatedAt: true },
			}),
		findOwned: async (userId: string, id: string) =>
			prisma.project.findFirst({ where: { id, userId }, select: projectSelect }),
		create: async (
			userId: string,
			name: string,
			content: string,
			attachments: ReturnType<typeof validateAttachments>,
		) =>
			prisma.project.create({
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
			}),
		rename: async (userId: string, id: string, name: string, renamedAt: Date) =>
			prisma.project.updateMany({
				where: { id, userId },
				data: { name, titleGeneratedAt: renamedAt },
			}),
		delete: async (userId: string, id: string) =>
			prisma.project.deleteMany({ where: { id, userId } }),
		claimTitle: async (userId: string, id: string, claimedAt: Date) =>
			prisma.project.updateMany({
				where: { id, userId, titleGeneratedAt: null },
				data: { titleGeneratedAt: claimedAt },
			}),
		titleSource: async (projectId: string) =>
			prisma.message.findMany({
				where: { projectId, type: { not: "SUMMARY" } },
				orderBy: { createdAt: "asc" },
				take: 2,
				select: { role: true, content: true, attachments: { select: { id: true }, take: 1 } },
			}),
		saveTitle: async (userId: string, id: string, name: string, claimedAt: Date) =>
			prisma.project.updateMany({
				where: { id, userId, titleGeneratedAt: claimedAt },
				data: { name },
			}),
	};
}
