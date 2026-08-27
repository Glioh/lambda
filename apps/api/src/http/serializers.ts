import type { Message, Project, ProjectListItem } from "../contracts/index.js";

type ProjectListRecord = Omit<ProjectListItem, "createdAt" | "updatedAt"> & {
	createdAt: Date;
	updatedAt: Date;
};

type ProjectRecord = Omit<Project, "createdAt" | "updatedAt" | "titleGeneratedAt"> & {
	createdAt: Date;
	updatedAt: Date;
	titleGeneratedAt: Date | null;
};

type MessageRecord = Omit<Message, "createdAt" | "updatedAt"> & {
	createdAt: Date;
	updatedAt: Date;
};

export function serializeProjectListItem(project: ProjectListRecord): ProjectListItem {
	return {
		...project,
		createdAt: project.createdAt.toISOString(),
		updatedAt: project.updatedAt.toISOString(),
	};
}

export function serializeProject(project: ProjectRecord): Project {
	return {
		...project,
		createdAt: project.createdAt.toISOString(),
		updatedAt: project.updatedAt.toISOString(),
		titleGeneratedAt: project.titleGeneratedAt?.toISOString() ?? null,
	};
}

export function serializeMessage(message: MessageRecord): Message {
	return {
		...message,
		createdAt: message.createdAt.toISOString(),
		updatedAt: message.updatedAt.toISOString(),
	};
}
