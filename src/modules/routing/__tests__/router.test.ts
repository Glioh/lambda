import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideRoute } from "../router";

const logger = () => undefined;

describe("decideRoute", () => {
	it("routes explicit build with high confidence", () => {
		assert.deepEqual(
			decideRoute({ value: "what should we do?", routing: { mode: "build" } }, logger),
			{
				decision: "build",
				decisionSource: "explicit",
				confidence: "high",
			},
		);
	});

	it("routes structured build intent to build immediately", () => {
		assert.deepEqual(decideRoute({ value: "build a landing page for my SaaS" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "high",
		});
	});

	it("routes ambiguous prompts to low confidence chat when no prior build exists", () => {
		assert.deepEqual(decideRoute({ value: "make it better" }, logger), {
			decision: "chat",
			decisionSource: "auto",
			confidence: "low",
		});
	});

	it("routes follow-up modification to build when prior build exists", () => {
		assert.deepEqual(
			decideRoute({ value: "make it red", hasPriorBuild: true }, logger),
			{
				decision: "build",
				decisionSource: "auto",
				confidence: "medium",
			},
		);
	});

	it("routes conceptual question to chat even with prior build", () => {
		assert.deepEqual(
			decideRoute(
				{ value: "what is React?", hasPriorBuild: true },
				logger,
			),
			{
				decision: "chat",
				decisionSource: "auto",
				confidence: "low",
			},
		);
	});
});

describe("fuzzy build routing", () => {
	it("routes build me a blue page to build via exact regex", () => {
		assert.deepEqual(decideRoute({ value: "build me a blue page" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "high",
		});
	});

	it("routes build me a blue pag to build via fuzzy match", () => {
		assert.deepEqual(decideRoute({ value: "build me a blue pag" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "medium",
		});
	});

	it("routes make me a websit to build via fuzzy match", () => {
		assert.deepEqual(decideRoute({ value: "make me a websit" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "medium",
		});
	});

	it("routes how do I build a page? to chat through the question guard", () => {
		assert.deepEqual(decideRoute({ value: "how do I build a page?" }, logger), {
			decision: "chat",
			decisionSource: "auto",
			confidence: "low",
		});
	});

	it("routes build me a blue bag to chat when edit distance is too high", () => {
		assert.deepEqual(decideRoute({ value: "build me a blue bag" }, logger), {
			decision: "chat",
			decisionSource: "auto",
			confidence: "low",
		});
	});
});
