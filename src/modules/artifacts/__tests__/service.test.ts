import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { Prisma } from "@prisma/client";
import {
	createArtifactVersion,
	getLatestArtifactVersion,
	listArtifactVersions,
	toArtifactVersionPayload,
} from "../server/service";

describe("artifact service", () => {
	it("serializes artifact files into a path map", () => {
		const payload = toArtifactVersionPayload({
			id: "version_1",
			version: 3,
			runId: "run_1",
			sandboxUrl: "https://sandbox.example",
			title: "Landing page refresh",
			createdAt: new Date("2026-04-23T00:00:00.000Z"),
			artifactId: "artifact_1",
			files: [
				{
					id: "file_1",
					artifactVersionId: "version_1",
					path: "src/app/page.tsx",
					content: "export default function Page() {}",
				},
				{
					id: "file_2",
					artifactVersionId: "version_1",
					path: "src/app/globals.css",
					content: "body { margin: 0; }",
				},
			],
		});

		assert.deepEqual(payload.files, {
			"src/app/page.tsx": "export default function Page() {}",
			"src/app/globals.css": "body { margin: 0; }",
		});
		assert.equal(payload.version, 3);
	});

	it("creates the next immutable artifact version with file rows", async () => {
		const upsert = mock.fn(async () => ({ id: "artifact_1" }));
		const findFirst = mock.fn(async () => ({ version: 2 }));
		const create = mock.fn(async (args: { data: Record<string, unknown> }) => ({
			id: "version_3",
			version: args.data.version as number,
			runId: "run_3",
			sandboxUrl: "https://sandbox.example",
			title: "Title",
			createdAt: new Date("2026-04-23T00:00:00.000Z"),
			artifactId: "artifact_1",
			files: [
				{
					id: "file_1",
					artifactVersionId: "version_3",
					path: "src/app/page.tsx",
					content: "export default function Page() {}",
				},
			],
		}));

		const tx = {
			artifact: { upsert },
			artifactVersion: { findFirst, create },
		};

		const transaction = mock.fn(
			async (
				callback: (client: typeof tx) => Promise<unknown>,
				options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
			) => {
				assert.equal(
					options?.isolationLevel,
					Prisma.TransactionIsolationLevel.Serializable,
				);
				return callback(tx);
			},
		);

		const result = await createArtifactVersion(
			{
				$transaction: transaction as never,
				artifactVersion: {} as never,
			},
			{
				projectId: "project_1",
				runId: "run_3",
				sandboxUrl: "https://sandbox.example",
				title: "Title",
				files: {
					"src/app/page.tsx": "export default function Page() {}",
				},
			},
		);

		assert.equal(result.version, 3);
		assert.deepEqual(result.files, {
			"src/app/page.tsx": "export default function Page() {}",
		});
		assert.equal(upsert.mock.callCount(), 1);
		assert.equal(findFirst.mock.callCount(), 1);
		assert.equal(create.mock.callCount(), 1);
		assert.deepEqual(
			(
				create.mock.calls[0].arguments[0].data as {
					files: { create: Array<{ path: string; content: string }> };
				}
			).files.create,
			[
			{
				path: "src/app/page.tsx",
				content: "export default function Page() {}",
			},
			],
		);
	});

	it("returns the latest artifact version for a project", async () => {
		const findFirst = mock.fn(async () => ({
			id: "version_2",
			version: 2,
			runId: "run_2",
			sandboxUrl: "https://sandbox.example",
			title: "Dashboard polish",
			createdAt: new Date("2026-04-24T00:00:00.000Z"),
			artifactId: "artifact_1",
			files: [
				{
					id: "file_1",
					artifactVersionId: "version_2",
					path: "src/app/page.tsx",
					content: "export default function Page() { return null; }",
				},
			],
		}));

		const result = await getLatestArtifactVersion(
			{
				artifactVersion: {
					findFirst,
				},
			} as never,
			"project_1",
		);

		assert.equal(result?.version, 2);
		assert.deepEqual(result?.files, {
			"src/app/page.tsx": "export default function Page() { return null; }",
		});
	});

	it("lists historical versions with file counts", async () => {
		const findMany = mock.fn(async () => [
			{
				id: "version_2",
				version: 2,
				runId: "run_2",
				sandboxUrl: "https://sandbox.example",
				title: "Dashboard polish",
				createdAt: new Date("2026-04-24T00:00:00.000Z"),
				_count: { files: 4 },
			},
			{
				id: "version_1",
				version: 1,
				runId: "run_1",
				sandboxUrl: "https://sandbox.example",
				title: "Initial build",
				createdAt: new Date("2026-04-23T00:00:00.000Z"),
				_count: { files: 2 },
			},
		]);

		const result = await listArtifactVersions(
			{
				artifactVersion: {
					findMany,
				},
			} as never,
			"project_1",
		);

		assert.deepEqual(result, [
			{
				id: "version_2",
				version: 2,
				runId: "run_2",
				sandboxUrl: "https://sandbox.example",
				title: "Dashboard polish",
				createdAt: new Date("2026-04-24T00:00:00.000Z"),
				fileCount: 4,
			},
			{
				id: "version_1",
				version: 1,
				runId: "run_1",
				sandboxUrl: "https://sandbox.example",
				title: "Initial build",
				createdAt: new Date("2026-04-23T00:00:00.000Z"),
				fileCount: 2,
			},
		]);
	});
});
