import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rollbackScope, survivingMessages } from "@/modules/messages/lib/rollback";

const at = (minute: number) => new Date(2026, 7, 2, 12, minute, 0);

/**
 * A chat compacted twice. Each SUMMARY is backdated to the newest message it
 * folded, which is how the chat route places checkpoints — so `sum1` covers
 * everything through t=2 and `sum2` covers everything through t=5.
 */
const chatHistory = [
	{ id: "u1", createdAt: at(1), type: "RESULT" as const, role: "USER" },
	{ id: "a1", createdAt: at(2), type: "RESULT" as const, role: "ASSISTANT" },
	{ id: "sum1", createdAt: at(2), type: "SUMMARY" as const, role: "ASSISTANT" },
	{ id: "u2", createdAt: at(3), type: "RESULT" as const, role: "USER" },
	{ id: "a2", createdAt: at(4), type: "RESULT" as const, role: "ASSISTANT" },
	{ id: "u3", createdAt: at(5), type: "RESULT" as const, role: "USER" },
	{ id: "sum2", createdAt: at(5), type: "SUMMARY" as const, role: "ASSISTANT" },
	{ id: "a3", createdAt: at(6), type: "ERROR" as const, role: "ASSISTANT" },
];

const survivorsOf = (boundary: Date, edge: "from" | "after") =>
	survivingMessages(chatHistory, rollbackScope(boundary, edge)).map(m => m.id);

describe("rollbackScope: retrying an answer", () => {
	it("discards the answer itself and everything after it", () => {
		assert.deepEqual(survivorsOf(at(4), "from"), ["u1", "a1", "sum1", "u2"]);
	});

	it("discards a checkpoint dated after the retried answer", () => {
		// The regression this rule exists for. `sum2` folded messages through t=5,
		// which this rollback deletes — keeping it would replay a summary of a
		// chat that no longer exists. Sparing SUMMARY rows unconditionally
		// (correct only when retrying the newest answer) got this wrong.
		assert.ok(!survivorsOf(at(4), "from").includes("sum2"));
	});

	it("keeps checkpoints that predate the retried answer", () => {
		// `sum1` folded only t<=2, all of which survives, so it stays valid and
		// keeps the route's `createdAt > checkpoint` history load correct.
		assert.ok(survivorsOf(at(4), "from").includes("sum1"));
	});

	it("discards a checkpoint sharing the retried answer's timestamp", () => {
		assert.deepEqual(survivorsOf(at(2), "from"), ["u1"]);
	});

	it("can retry an error message", () => {
		// ERROR rows are otherwise dead ends you can only escape by retyping.
		assert.deepEqual(survivorsOf(at(6), "from"), ["u1", "a1", "sum1", "u2", "a2", "u3", "sum2"]);
	});

	it("leaves the chat ending on the prompt behind the retried answer", () => {
		const surviving = survivingMessages(chatHistory, rollbackScope(at(6), "from"));
		const last = surviving.filter(m => m.type !== "SUMMARY").at(-1);
		assert.equal(last?.id, "u3");
		assert.equal(last?.role, "USER");
	});
});

describe("rollbackScope: re-running or editing a prompt", () => {
	it("keeps the prompt and discards everything after it", () => {
		assert.deepEqual(survivorsOf(at(3), "after"), ["u1", "a1", "sum1", "u2"]);
	});

	it("discards checkpoints dated after the prompt", () => {
		assert.ok(!survivorsOf(at(3), "after").includes("sum2"));
	});

	it("keeps a checkpoint sharing the prompt's timestamp", () => {
		// `sum2` folded through t=5 and t=5 itself survives, so it stays valid.
		assert.ok(survivorsOf(at(5), "after").includes("sum2"));
	});

	it("leaves the chat ending on the prompt itself", () => {
		const surviving = survivingMessages(chatHistory, rollbackScope(at(5), "after"));
		const last = surviving.filter(m => m.type !== "SUMMARY").at(-1);
		assert.equal(last?.id, "u3");
	});
});
