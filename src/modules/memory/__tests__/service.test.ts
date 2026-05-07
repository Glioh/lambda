import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	assembleThreadMemoryFromParts,
	renderThreadMemoryContext,
	type ThreadMemoryMessage,
} from "../server/service";

function createMessages(count: number): ThreadMemoryMessage[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `message_${index + 1}`,
		role: index % 2 === 0 ? "USER" : "ASSISTANT",
		content: `Message ${index + 1}`,
		createdAt: new Date(`2026-04-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
	}));
}

describe("thread memory service", () => {
	it("assembles a thread-level pack with recent messages, summary, artifact context, and current input", () => {
		const pack = assembleThreadMemoryFromParts({
			messages: createMessages(12),
			currentUserMessage: "Current user request",
			artifactVersion: {
				id: "version_1",
				version: 2,
				runId: "run_1",
				sandboxUrl: "https://sandbox.example",
				title: "Dashboard",
				createdAt: new Date("2026-04-23T00:00:00.000Z"),
				files: [
					{ path: "README.md", content: "Project notes" },
					{ path: "src/app/page.tsx", content: "export default function Page() {}" },
					{ path: "package.json", content: "{\"scripts\":{}}" },
				],
			},
			options: {
				recentMessageLimit: 10,
				selectedWorkingFileLimit: 2,
			},
			now: new Date("2026-04-23T00:00:00.000Z"),
		});

		assert.equal(pack.recentMessages.length, 10);
		assert.equal(pack.recentMessages.at(-1)?.content, "Current user request");
		assert.match(pack.conversationSummary, /Message 1/);
		assert.match(pack.activeArtifactSummary, /Version 2: Dashboard/);
		assert.deepEqual(
			pack.selectedWorkingFiles.map((file) => file.path),
			["package.json", "src/app/page.tsx"],
		);
		assert.equal(pack.summaryRefresh.shouldRefresh, true);
		assert.equal(pack.summaryRefresh.reason, "missing");
	});

	it("renders prompt context without introducing global memory", () => {
		const pack = assembleThreadMemoryFromParts({
			messages: createMessages(1),
			options: { selectedWorkingFileLimit: 0 },
		});

		const rendered = renderThreadMemoryContext(pack);

		assert.match(rendered, /Thread-level memory context/);
		assert.match(rendered, /do not infer any project-level or user-level global memory/);
		assert.match(rendered, /No selected working files/);
	});

	it("enforces the context budget by omitting low-priority working files first", () => {
		const pack = assembleThreadMemoryFromParts({
			messages: createMessages(20),
			artifactVersion: {
				version: 1,
				runId: null,
				sandboxUrl: null,
				title: null,
				createdAt: new Date("2026-04-23T00:00:00.000Z"),
				files: [
					{ path: "src/app/page.tsx", content: "a".repeat(1200) },
					{ path: "src/components/card.tsx", content: "b".repeat(1200) },
					{ path: "docs/notes.md", content: "c".repeat(1200) },
				],
			},
			options: {
				maxContextChars: 2_000,
				selectedWorkingFileLimit: 3,
				maxWorkingFileChars: 1_200,
			},
		});

		assert.equal(pack.budget.maxChars, 2_000);
		assert.equal(pack.budget.truncated, true);
		assert.ok(pack.budget.omittedWorkingFiles > 0);
		assert.ok(pack.budget.usedChars <= 2_000);
	});
});
