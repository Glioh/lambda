/**
 * Discovers repository modules and regenerates repositories.generated.ts with imports and factory wiring. This
 * removes manual registration drift when repositories are added or renamed.
 */

import { watch } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoriesDirectory = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../apps/api/src/database/repositories",
);
const outputPath = join(repositoriesDirectory, "repositories.generated.ts");
const generatedHeader = `// GENERATED FILE — DO NOT EDIT.

`;

function isRepositoryModule(fileName: string): boolean {
	return fileName.endsWith(".repository.ts") && !fileName.endsWith(".d.ts");
}

function repositoryName(fileName: string): string {
	const name = fileName.slice(0, -".repository.ts".length);
	if (!/^[a-z][A-Za-z0-9]*$/.test(name)) {
		throw new Error(
			`Invalid repository filename "${fileName}". Use <name>.repository.ts with a valid identifier.`,
		);
	}
	return name;
}

export async function discoverRepositoryNames(root: string): Promise<string[]> {
	const names = (await readdir(root, { withFileTypes: true }))
		.filter(entry => entry.isFile() && isRepositoryModule(entry.name))
		.map(entry => repositoryName(entry.name));

	return names.sort();
}

export function renderRepositories(names: readonly string[]): string {
	const sorted = [...names].sort();
	if (new Set(sorted).size !== sorted.length) {
		throw new Error(`Duplicate repository names: ${sorted.join(", ")}`);
	}

	const repositoryImports = sorted
		.map(name => `import { ${name}Repository } from "./${name}.repository.js";`)
		.join("\n");
	const renderProperties = (names: readonly string[]) =>
		names.map(name => `\t\t${name}: ${name}Repository(db),`).join("\n");
	// Usage currently requires the root PrismaClient.
	// Introduce repository capability metadata if more repositories need exclusion.
	const transactionRepositoryNames = sorted.filter(name => name !== "usage");

	const imports = [
		'import type { DatabaseClient } from "../client.js";',
		'import type { PrismaClient } from "@prisma/client";',
		repositoryImports,
	]
		.filter(Boolean)
		.join("\n");

	return `${generatedHeader}${imports}

export function createRepositories(db: PrismaClient) {
	return {
${renderProperties(sorted)}
	};
}

export function createTransactionRepositories(db: DatabaseClient) {
	return {
${renderProperties(transactionRepositoryNames)}
	};
}

export type Repositories = ReturnType<typeof createRepositories>;
export type TransactionRepositories = ReturnType<typeof createTransactionRepositories>;
`;
}

export async function generateRepositories(
	root = repositoriesDirectory,
	output = outputPath,
): Promise<boolean> {
	const generated = renderRepositories(await discoverRepositoryNames(root));
	let current = "";
	try {
		current = await readFile(output, "utf8");
	} catch (error) {
		if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT")
			throw error;
	}

	if (current === generated) return false;
	await writeFile(output, generated, "utf8");
	return true;
}

export function shouldRegenerateRepositories(
	eventType: "rename" | "change",
	filename: string | Buffer | null,
	root: string,
	output: string,
): boolean {
	const relativePath = filename?.toString();
	if (relativePath && resolve(root, relativePath) === resolve(output)) return false;
	return eventType === "rename" || !relativePath || isRepositoryModule(relativePath);
}

export async function watchRepositories(
	root = repositoriesDirectory,
	output = outputPath,
	initial = true,
): Promise<void> {
	if (initial) await generateRepositories(root, output);
	let timer: NodeJS.Timeout | undefined;
	const watcher = watch(root, (eventType, filename) => {
		if (!shouldRegenerateRepositories(eventType, filename, root, output)) return;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			void generateRepositories(root, output).catch(error => console.error(error));
		}, 100);
	});

	await new Promise<void>(resolvePromise => {
		const close = () => {
			if (timer) clearTimeout(timer);
			watcher.close();
			process.off("SIGINT", close);
			process.off("SIGTERM", close);
			resolvePromise();
		};
		process.once("SIGINT", close);
		process.once("SIGTERM", close);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const run = process.argv.includes("--watch")
		? () => watchRepositories(undefined, undefined, !process.argv.includes("--skip-initial"))
		: generateRepositories;
	void run().catch(error => {
		console.error(error);
		process.exitCode = 1;
	});
}
