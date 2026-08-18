import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { generateChatTitle, sanitizeTitle } from "@/modules/projects/server/title";

/**
 * Builds a fetch stand-in returning a chat-completions payload.
 * @param {string} content - The title text the model "returned".
 * @returns {typeof fetch} The mocked fetch.
 */
const okFetch = (content: string) =>
	mock.fn(async () =>
		Response.json({ choices: [{ message: { content } }] }),
	) as unknown as typeof fetch;

describe("sanitizeTitle", () => {
	it("strips wrapping quotes, backticks, and markdown emphasis", () => {
		assert.equal(sanitizeTitle('"Debugging a render loop"'), "Debugging a render loop");
		assert.equal(sanitizeTitle("`Hash map collisions`"), "Hash map collisions");
		assert.equal(sanitizeTitle("**Tailwind layout help**"), "Tailwind layout help");
		assert.equal(sanitizeTitle("## Server components"), "Server components");
	});

	it("strips trailing sentence punctuation", () => {
		assert.equal(sanitizeTitle("Explaining recursion."), "Explaining recursion");
		assert.equal(sanitizeTitle("What are generics?"), "What are generics");
	});

	it("collapses newlines and repeated whitespace", () => {
		assert.equal(sanitizeTitle("Hash   maps\nand  collisions"), "Hash maps and collisions");
	});

	it("truncates to eight words", () => {
		assert.equal(
			sanitizeTitle("one two three four five six seven eight nine ten"),
			"one two three four five six seven eight",
		);
	});

	it("truncates to sixty characters", () => {
		const title = sanitizeTitle(`${"a".repeat(80)}`);
		assert.equal(title?.length, 60);
	});

	it("returns null when nothing usable remains", () => {
		assert.equal(sanitizeTitle(""), null);
		assert.equal(sanitizeTitle("   "), null);
		assert.equal(sanitizeTitle('"""'), null);
	});
});

describe("generateChatTitle", () => {
	it("returns the sanitized title and calls the cheap model", async () => {
		const fetchImpl = okFetch('"Debugging a useEffect loop"');

		const title = await generateChatTitle(
			[
				{ role: "USER", content: "why does my useEffect run twice" },
				{ role: "ASSISTANT", content: "That's StrictMode in development." },
			],
			fetchImpl,
		);

		assert.equal(title, "Debugging a useEffect loop");

		const call = (fetchImpl as unknown as ReturnType<typeof mock.fn>).mock.calls[0];
		const body = JSON.parse((call.arguments[1] as { body: string }).body) as {
			model: string;
			max_tokens: number;
			messages: Array<{ role: string; content: string }>;
		};

		assert.equal(body.model, "gpt-4.1-mini");
		assert.equal(body.max_tokens, 24);
		assert.match(body.messages[1].content, /why does my useEffect run twice/);
	});

	it("describes an image-only opening message to the model", async () => {
		const fetchImpl = okFetch("Reading a stack trace screenshot");

		await generateChatTitle([{ role: "USER", content: "", hasImage: true }], fetchImpl);

		const call = (fetchImpl as unknown as ReturnType<typeof mock.fn>).mock.calls[0];
		const body = JSON.parse((call.arguments[1] as { body: string }).body) as {
			messages: Array<{ content: string }>;
		};

		assert.match(body.messages[1].content, /\[shared an image\]/);
	});

	it("returns null on a non-200 response", async () => {
		const fetchImpl = mock.fn(
			async () => new Response("nope", { status: 429 }),
		) as unknown as typeof fetch;

		assert.equal(await generateChatTitle([{ role: "USER", content: "hi" }], fetchImpl), null);
	});

	it("returns null when the request throws", async () => {
		const fetchImpl = mock.fn(async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		assert.equal(await generateChatTitle([{ role: "USER", content: "hi" }], fetchImpl), null);
	});

	it("returns null when the payload has no content", async () => {
		const fetchImpl = mock.fn(async () =>
			Response.json({ choices: [] }),
		) as unknown as typeof fetch;

		assert.equal(await generateChatTitle([{ role: "USER", content: "hi" }], fetchImpl), null);
	});

	it("returns null without calling the model when there is nothing to title", async () => {
		const fetchImpl = mock.fn(async () =>
			Response.json({ choices: [{ message: { content: "x" } }] }),
		) as unknown as typeof fetch;

		assert.equal(await generateChatTitle([], fetchImpl), null);
		assert.equal((fetchImpl as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
	});
});
