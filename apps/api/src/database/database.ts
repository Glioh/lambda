import type { Repositories, TransactionRepositories, } from "./repositories/repositories.generated.js";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { createRepositories, createTransactionRepositories, } from "./repositories/repositories.generated.js";

/** Repository API plus explicit transaction support for application code. */
export type Database = Repositories & {
	transaction<T>(work: (repositories: TransactionRepositories) => Promise<T>): Promise<T>;
};

/**
 * Creates repositories bound to one Prisma client.
 * Transaction callbacks receive repositories bound to Prisma's transaction client.
 *
 * NOTE: Usage is intentionally excluded from application database transactions because
 * RateLimiterPrisma requires the root PrismaClient and manages its own Prisma
 * transaction. Revisit the usage/budget implementation as part of split
 * budget-control work in #34.
 */
export function createDatabase(client: PrismaClient): Database {
	return {
		...createRepositories(client),
		transaction<T>(work: (repositories: TransactionRepositories) => Promise<T>) {
			// Prisma commits on success and rolls back when the callback throws.
			return client.$transaction(transactionClient => {
				return work(createTransactionRepositories(transactionClient));
			});
		},
	};
}

/** Shared database instance used by production code. */
export const database = createDatabase(prisma);
