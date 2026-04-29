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

	it("routes ambiguous prompts to low confidence chat", () => {
		assert.deepEqual(decideRoute({ value: "make it better" }, logger), {
			decision: "chat",
			decisionSource: "auto",
			confidence: "low",
			requiresConfirmation: false,
		});
	});

	it("never auto-routes build without requiring confirmation", () => {
		const inputs = [
			"build a landing page for my SaaS",
			"create a next app",
			"generate an app",
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
