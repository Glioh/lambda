// GENERATED FILE — DO NOT EDIT.

import type { DatabaseClient } from "../client.js";
import type { PrismaClient } from "@prisma/client";
import { messagesRepository } from "./messages.repository.js";
import { projectsRepository } from "./projects.repository.js";
import { usageRepository } from "./usage.repository.js";

export function createRepositories(db: PrismaClient) {
	return {
		messages: messagesRepository(db),
		projects: projectsRepository(db),
		usage: usageRepository(db),
	};
}

export function createTransactionRepositories(db: DatabaseClient) {
	return {
		messages: messagesRepository(db),
		projects: projectsRepository(db),
	};
}

export type Repositories = ReturnType<typeof createRepositories>;
export type TransactionRepositories = ReturnType<typeof createTransactionRepositories>;
