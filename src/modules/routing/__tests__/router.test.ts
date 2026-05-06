import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideRoute } from "../router";

const logger = () => undefined;

describe("decideRoute", () => {
	it("routes explicit build with high confidence and confirmation", () => {
		assert.deepEqual(
			decideRoute({ value: "what should we do?", routing: { mode: "build" } }, logger),
			{
				decision: "build",
				decisionSource: "explicit",
				confidence: "high",
				requiresConfirmation: true,
			},
		);
	});

	it("routes structured build intent to build with confirmation", () => {
		assert.deepEqual(decideRoute({ value: "build a landing page for my SaaS" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "high",
			requiresConfirmation: true,
		});
	});

	it("routes ambiguous prompts to low confidence chat (no prior build)", () => {
		assert.deepEqual(decideRoute({ value: "make it better" }, logger), {
			decision: "chat",
			decisionSource: "auto",
			confidence: "low",
			requiresConfirmation: false,
		});
	});

	it("routes follow-up modification to build when prior build exists", () => {
		assert.deepEqual(
			decideRoute({ value: "make it red", hasPriorBuild: true }, logger),
			{
				decision: "build",
				decisionSource: "auto",
				confidence: "medium",
				requiresConfirmation: true,
			},
		);
	});

	it("routes 'change the header' to build when prior build exists", () => {
		assert.deepEqual(
			decideRoute(
				{ value: "change the header color to blue", hasPriorBuild: true },
				logger,
			),
			{
				decision: "build",
				decisionSource: "auto",
				confidence: "medium",
				requiresConfirmation: true,
			},
		);
	});

	it("routes 'add a contact form' to build when prior build exists", () => {
		assert.deepEqual(
			decideRoute(
				{ value: "add a contact form", hasPriorBuild: true },
				logger,
			),
			{
				decision: "build",
				decisionSource: "auto",
				confidence: "medium",
				requiresConfirmation: true,
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
				requiresConfirmation: false,
			},
		);
	});

	it("routes pure greeting to chat even with prior build", () => {
		assert.deepEqual(
			decideRoute({ value: "thanks!", hasPriorBuild: true }, logger),
			{
				decision: "chat",
				decisionSource: "auto",
				confidence: "low",
				requiresConfirmation: false,
			},
		);
	});

	it("never auto-routes build without requiring confirmation", () => {
		const inputs = [
			"build a landing page for my SaaS",
			"create a next app",
			"generate an app",
			"build me a blue pag",
			"make me a websit",
			"```json\n{\"spec\":\"landing page\"}\n```",
			"make it better",
			"what is React?",
			"explain server components",
		];

		for (const value of inputs) {
			const decision = decideRoute({ value }, logger);

			assert.notDeepEqual(
				{
					decision: decision.decision,
					decisionSource: decision.decisionSource,
					requiresConfirmation: decision.requiresConfirmation,
				},
				{
					decision: "build",
					decisionSource: "auto",
					requiresConfirmation: false,
				},
			);
		}
	});
});

describe("fuzzy build routing", () => {
	it("routes build me a blue page to build via exact regex (high confidence)", () => {
		assert.deepEqual(decideRoute({ value: "build me a blue page" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "high",
			requiresConfirmation: true,
		});
	});

	it("routes build me a blue pag to build via fuzzy match (medium confidence)", () => {
		assert.deepEqual(decideRoute({ value: "build me a blue pag" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "medium",
			requiresConfirmation: true,
		});
	});

	it("routes make me a websit to build via fuzzy match", () => {
		assert.deepEqual(decideRoute({ value: "make me a websit" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "medium",
			requiresConfirmation: true,
		});
	});

	it("routes create a dashbord to build via fuzzy match", () => {
		assert.deepEqual(decideRoute({ value: "create a dashbord" }, logger), {
			decision: "build",
			decisionSource: "auto",
			confidence: "medium",
			requiresConfirmation: true,
		});
	});

	it("routes how do I build a page? to chat (question guard)", () => {
		assert.deepEqual(decideRoute({ value: "how do I build a page?" }, logger), {
			decision: "chat",
			decisionSource: "auto",
			confidence: "low",
			requiresConfirmation: false,
		});
	});

	it("routes what is a landing page? to chat (conceptual question)", () => {
		assert.deepEqual(decideRoute({ value: "what is a landing page?" }, logger), {
			decision: "chat",
			decisionSource: "auto",
			confidence: "low",
			requiresConfirmation: false,
		});
	});

	it("routes build me a blue bag to chat (edit distance too high)", () => {
		assert.deepEqual(decideRoute({ value: "build me a blue bag" }, logger), {
			decision: "chat",
			decisionSource: "auto",
			confidence: "low",
			requiresConfirmation: false,
		});
	});
});
