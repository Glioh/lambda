import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { format, resolveConfig } from "prettier";
import { discoverRepositoryNames, generateRepositories, renderRepositories, shouldRegenerateRepositories, } from "./generate-repositories.js";

async function withTempRepositories(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "lambda-repositories-"));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe("repository generator", () => {
	it("discovers and sorts repository modules", async () => {
		await withTempRepositories(async root => {
			await writeFile(join(root, "projects.repository.ts"), "");
			await writeFile(join(root, "messages.repository.ts"), "");
			await writeFile(join(root, "repositories.generated.ts"), "stale");
			await writeFile(join(root, "usage.test.ts"), "");

			assert.deepEqual(await discoverRepositoryNames(root), ["messages", "projects"]);
		});
	});

	it("renders static imports and composition", () => {
		const generated = renderRepositories(["projects", "messages", "usage"]);
		const transactionFactory = generated.slice(
			generated.indexOf("export function createTransactionRepositories"),
		);

		assert.match(
			generated,
			/import type \{ PrismaClient \} from "@prisma\/client";[\s\S]*export function createRepositories\(db: PrismaClient\)[\s\S]*usage: usageRepository\(db\),/,
		);
		assert.match(
			transactionFactory,
			/export function createTransactionRepositories\(db: DatabaseClient\)/,
		);
		assert.match(
			transactionFactory,
			/messages: messagesRepository\(db\),[\s\S]*projects: projectsRepository\(db\),/,
		);
		assert.doesNotMatch(transactionFactory, /usage: usageRepository\(db\),/);
	});

	it("does not rewrite unchanged output", async () => {
		await withTempRepositories(async root => {
			await writeFile(join(root, "messages.repository.ts"), "");
			const output = join(root, "repositories.generated.ts");

			assert.equal(await generateRepositories(root, output), true);
			const generated = await readFile(output, "utf8");
			assert.equal(
				await format(generated, {
					...(await resolveConfig("apps/api/src/database/repositories/repositories.generated.ts")),
					parser: "typescript",
				}),
				generated,
			);
			assert.equal(await generateRepositories(root, output), false);
			assert.equal(await readFile(output, "utf8"), generated);
		});
	});

	it("rejects duplicate generated names", () => {
		assert.throws(() => renderRepositories(["messages", "messages"]), /Duplicate repository names/);
	});

	it("rejects invalid repository filenames", async () => {
		await withTempRepositories(async root => {
			await mkdir(root, { recursive: true });
			await writeFile(join(root, "bad-name.repository.ts"), "");
			await assert.rejects(discoverRepositoryNames(root), /Invalid repository filename/);
		});
	});

	it("regenerates on repository add/remove events but ignores generated output", async () => {
		await withTempRepositories(async root => {
			const output = join(root, "repositories.generated.ts");
			assert.equal(shouldRegenerateRepositories("rename", "new.repository.ts", root, output), true);
			assert.equal(
				shouldRegenerateRepositories("change", "messages.repository.ts", root, output),
				true,
			);
			assert.equal(
				shouldRegenerateRepositories("change", "repositories.generated.ts", root, output),
				false,
			);
			assert.equal(shouldRegenerateRepositories("change", "notes.txt", root, output), false);
		});
	});
});
