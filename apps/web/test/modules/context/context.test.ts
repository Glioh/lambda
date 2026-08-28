import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ContextConfig } from "@/modules/context/constants";
import { buildCompactionMessages, buildSummaryContextBlock, SUMMARY_PREAMBLE, } from "@/modules/context/compaction";
import { compactionTriggerTokens, validateContextConfig } from "@/modules/context/constants";
import { estimateImageTokens, estimateMessagesTokens, estimateMessageTokens, estimateTokens, FALLBACK_IMAGE_TOKENS, LOW_DETAIL_IMAGE_TOKENS, } from "@/modules/context/tokens";
import { planContextWindow } from "@/modules/context/window";

const config: ContextConfig = {
	contextTokenBudget: 400,
	reserveOutputTokens: 100,
	keepRecentTokens: 100,
	summaryMaxTokens: 60,
	minKeepMessages: 2,
	historyFetchCap: 200,
	maxImagesInContext: 4,
};

/**
 * Builds a message whose content estimates to roughly the given token count.
 * @param {number} tokens - Approximate token size of the message content.
 * @param {string} label - Distinct label baked into the content.
 * @returns {{ role: "USER" | "ASSISTANT"; content: string }} The test message.
 */
function messageOfTokens(tokens: number, label: string) {
	const content = `${label}:`.padEnd(tokens * 4, "x");
	return { role: "USER" as const, content };
}

describe("tokens", () => {
	it("estimates ~4 characters per token, rounding up", () => {
		assert.equal(estimateTokens(""), 0);
		assert.equal(estimateTokens("abcd"), 1);
		assert.equal(estimateTokens("abcde"), 2);
	});

	it("adds per-message overhead", () => {
		assert.equal(estimateMessageTokens("abcd"), 5);
		assert.equal(estimateMessagesTokens(["abcd", "abcd"]), 10);
	});
});

describe("compactionTriggerTokens", () => {
	it("is the budget minus the reserved output", () => {
		assert.equal(compactionTriggerTokens(config), 300);
	});
});

describe("validateContextConfig", () => {
	it("accepts a config where reserve is below the budget", () => {
		assert.equal(validateContextConfig(config), config);
	});

	it("throws when reserve is greater than or equal to the budget", () => {
		assert.throws(
			() => validateContextConfig({ ...config, reserveOutputTokens: 400 }),
			/reserveOutputTokens/,
		);
		assert.throws(
			() => validateContextConfig({ ...config, reserveOutputTokens: 500 }),
			/must be less than contextTokenBudget/,
		);
	});
});

describe("planContextWindow", () => {
	it("keeps everything and skips compaction under the trigger", () => {
		const messages = [messageOfTokens(50, "a"), messageOfTokens(50, "b")];

		const plan = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 50,
			config,
		});

		assert.equal(plan.needsCompaction, false);
		assert.deepEqual(plan.head, []);
		assert.equal(plan.tail.length, 2);
	});

	it("splits head and tail when over the trigger", () => {
		const messages = [
			messageOfTokens(120, "old-1"),
			messageOfTokens(120, "old-2"),
			messageOfTokens(40, "recent-1"),
			messageOfTokens(40, "recent-2"),
		];

		const plan = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 50,
			config,
		});

		assert.equal(plan.needsCompaction, true);
		assert.equal(plan.head.length, 2);
		assert.match(plan.head[0].content, /^old-1/);
		assert.match(plan.head[1].content, /^old-2/);
		assert.equal(plan.tail.length, 2);
		assert.match(plan.tail[0].content, /^recent-1/);
	});

	it("counts the existing summary toward the estimate", () => {
		const messages = [
			messageOfTokens(60, "old"),
			messageOfTokens(40, "recent-1"),
			messageOfTokens(40, "recent-2"),
		];

		const withoutSummary = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 50,
			config,
		});
		const withSummary = planContextWindow({
			summaryContent: "s".repeat(600), // ~150 tokens
			messages,
			fixedTokens: 50,
			config,
		});

		assert.equal(withoutSummary.needsCompaction, false);
		assert.equal(withSummary.needsCompaction, true);
	});

	it("always keeps at least minKeepMessages in the tail, even when huge", () => {
		const messages = [
			messageOfTokens(50, "old"),
			messageOfTokens(500, "huge-1"),
			messageOfTokens(500, "huge-2"),
		];

		const plan = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 50,
			config,
		});

		assert.equal(plan.needsCompaction, true);
		assert.equal(plan.tail.length, 2);
		assert.match(plan.tail[0].content, /^huge-1/);
		assert.equal(plan.head.length, 1);
	});

	it("shrinks the verbatim tail as the fixed prompt grows (budgets the whole request)", () => {
		// 8 messages of ~20 tokens each = ~160 tokens of history.
		const messages = Array.from({ length: 8 }, (_, i) => messageOfTokens(16, `m${i + 1}`));

		// Small fixed prompt: the tail allowance is large, so more is kept verbatim.
		const smallFixed = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 160,
			config,
		});

		// Large fixed prompt: less room after reserving the summary envelope,
		// so the tail must shrink — down to the minKeepMessages floor here.
		const largeFixed = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 220,
			config,
		});

		assert.equal(smallFixed.needsCompaction, true);
		assert.equal(largeFixed.needsCompaction, true);
		assert.ok(
			largeFixed.tail.length < smallFixed.tail.length,
			"a bigger fixed prompt should keep fewer messages verbatim",
		);
		assert.equal(
			largeFixed.tail.length,
			config.minKeepMessages,
			"the tail never drops below minKeepMessages",
		);
	});

	it("skips compaction when there is nothing older to fold", () => {
		const messages = [messageOfTokens(500, "huge-1"), messageOfTokens(500, "huge-2")];

		const plan = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 50,
			config,
		});

		assert.equal(plan.needsCompaction, false);
		assert.equal(plan.tail.length, 2);
		assert.deepEqual(plan.head, []);
	});
});

describe("buildCompactionMessages", () => {
	it("serializes the head into a transcript for the summarizer", () => {
		const messages = buildCompactionMessages(null, [
			{ role: "USER", content: "Build me a site" },
			{ role: "ASSISTANT", content: "Sure, here it is" },
		]);

		assert.equal(messages.length, 2);
		assert.equal(messages[0].role, "system");
		assert.equal(messages[1].role, "user");
		assert.match(messages[1].content, /<chat_to_summarize>/);
		assert.match(messages[1].content, /User: Build me a site/);
		assert.match(messages[1].content, /Assistant: Sure, here it is/);
		assert.doesNotMatch(messages[1].content, /<previous_summary>/);
	});

	it("includes the previous summary for a merge update", () => {
		const messages = buildCompactionMessages("Earlier: user wants a blog.", [
			{ role: "USER", content: "Now add comments" },
		]);

		assert.match(messages[1].content, /<previous_summary>/);
		assert.match(messages[1].content, /user wants a blog/);
	});
});

describe("buildSummaryContextBlock", () => {
	it("prefixes the checkpoint with the historical-context preamble", () => {
		const block = buildSummaryContextBlock("The user wants a blog.");

		assert.ok(block.startsWith(SUMMARY_PREAMBLE));
		assert.match(block, /The user wants a blog\./);
	});
});

describe("estimateImageTokens", () => {
	it("charges a flat rate for low-detail images", () => {
		assert.equal(estimateImageTokens(4000, 3000, "low"), LOW_DETAIL_IMAGE_TOKENS);
	});

	it("charges per 512px tile after scaling the short edge to 768", () => {
		// 1024x1024 -> 768x768 -> 2x2 tiles.
		assert.equal(estimateImageTokens(1024, 1024), 85 + 170 * 4);
		// 512x512 is already under the target -> a single tile.
		assert.equal(estimateImageTokens(512, 512), 85 + 170);
	});

	it("clamps very large images before tiling", () => {
		// A 4000x3000 image fits into 2048 then scales to a 1024x768 box.
		assert.equal(estimateImageTokens(4000, 3000), 85 + 170 * 4);
	});

	it("falls back to a fixed estimate when dimensions are unusable", () => {
		assert.equal(estimateImageTokens(), FALLBACK_IMAGE_TOKENS);
		assert.equal(estimateImageTokens(0, 100), FALLBACK_IMAGE_TOKENS);
		assert.equal(estimateImageTokens(-1, -1), FALLBACK_IMAGE_TOKENS);
	});
});

describe("planContextWindow with extraTokens", () => {
	const config: ContextConfig = {
		contextTokenBudget: 400,
		reserveOutputTokens: 100,
		keepRecentTokens: 60,
		summaryMaxTokens: 50,
		minKeepMessages: 2,
		historyFetchCap: 200,
		maxImagesInContext: 4,
	};

	const messages = [
		{ role: "USER" as const, content: "one" },
		{ role: "ASSISTANT" as const, content: "two" },
		{ role: "USER" as const, content: "three" },
		{ role: "ASSISTANT" as const, content: "four" },
	];

	it("produces identical output to before when extraTokens is omitted", () => {
		// Guards the optional-parameter refactor: passing a zero-cost function
		// must be indistinguishable from passing nothing at all.
		const withoutHook = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 10,
			config,
		});
		const withZeroHook = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 10,
			config,
			extraTokens: () => 0,
		});

		assert.deepEqual(withoutHook, withZeroHook);
		assert.equal(withoutHook.needsCompaction, false);
	});

	it("counts extra tokens toward the compaction trigger", () => {
		const plan = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 10,
			config,
			extraTokens: () => 200,
		});

		assert.equal(plan.needsCompaction, true);
		assert.ok(plan.head.length > 0);
		assert.equal(plan.head.length + plan.tail.length, messages.length);
	});

	it("counts extra tokens when sizing the verbatim tail", () => {
		// Each message now costs more than the tail allowance, so only the
		// minKeepMessages floor survives.
		const plan = planContextWindow({
			summaryContent: null,
			messages,
			fixedTokens: 10,
			config,
			extraTokens: () => 200,
		});

		assert.equal(plan.tail.length, config.minKeepMessages);
	});
});

describe("buildCompactionMessages with attachments", () => {
	it("renders an image placeholder instead of any payload", () => {
		const messages = buildCompactionMessages(null, [
			{
				role: "USER",
				content: "what is this",
				attachments: [{ mimeType: "image/png", width: 1024, height: 768 }],
			},
		]);

		assert.match(messages[1].content, /\[image attached: image\/png 1024×768\]/);
	});

	it("omits the placeholder entirely when there are no attachments", () => {
		const messages = buildCompactionMessages(null, [{ role: "USER", content: "no images here" }]);

		assert.equal(messages[1].content.includes("[image attached"), false);
	});
});
