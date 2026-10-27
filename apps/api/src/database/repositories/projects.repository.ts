import type { ValidatedAttachment } from "../../attachments.js";
import type { DatabaseClient } from "../client.js";

const projectSelect = {
	id: true,
	name: true,
	createdAt: true,
	updatedAt: true,
	titleFinalized: true,
} as const;

export function projectsRepository(db: DatabaseClient) {
	return {
		async list(userId: string) {
			return db.project.findMany({
				where: { userId },
				orderBy: { updatedAt: "desc" },
				take: 200,
				select: projectSelect,
			});
		},

		async findById(userId: string, projectId: string) {
			return db.project.findFirst({ where: { id: projectId, userId }, select: projectSelect });
		},

		async create(
			userId: string,
			name: string,
			content: string,
			attachments: ValidatedAttachment[],
		) {
			return db.project.create({
				data: {
					userId,
					name,
					titleFinalized: false,
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

		async rename(userId: string, id: string, name: string) {
			return db.project.updateMany({
				where: { id, userId, titleFinalized: true },
				data: { name },
			});
		},

		async delete(userId: string, id: string) {
			return db.project.deleteMany({ where: { id, userId } });
		},

		async getTitleContext(userId: string, projectId: string) {
			const project = await db.project.findFirst({
				where: { id: projectId, userId, titleFinalized: false },
				select: {
					messages: {
						where: { type: { not: "SUMMARY" } },
						orderBy: { createdAt: "asc" },
						take: 2,
						select: { role: true, content: true, attachments: { select: { id: true }, take: 1 } },
					},
				},
			});
			return project?.messages ?? null;
		},

		async agentRename(userId: string, id: string, name: string | null) {
			return db.project.updateMany({
				where: { id, userId, titleFinalized: false },
				data: { ...(name ? { name } : {}), titleFinalized: true },
			});
		},

		async touch(id: string, updatedAt: Date) {
			return db.project.update({ where: { id }, data: { updatedAt } });
		},
	};
}
