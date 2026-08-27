import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { generateChatTitle, sanitizeTitle } from "../projects/title.js";

const okFetch = (content: string) =>
	mock.fn(async () =>
		Response.json({ choices: [{ message: { content } }] }),
	) as unknown as typeof fetch;

describe("sanitizeTitle", () => {
	it("preserves title cleanup and length constraints", () => {
		assert.equal(sanitizeTitle('"Debugging a render loop"'), "Debugging a render loop");
		assert.equal(sanitizeTitle("Hash   maps\nand  collisions"), "Hash maps and collisions");
		assert.equal(
			sanitizeTitle("one two three four five six seven eight nine ten"),
			"one two three four five six seven eight",
		);
		assert.equal(sanitizeTitle(`${"a".repeat(80)}`)?.length, 60);
		assert.equal(sanitizeTitle('"""'), null);
	});
});

describe("generateChatTitle", () => {
	it("keeps previous prompt, model, and image-marker behavior", async () => {
		const fetchImpl = okFetch('"Debugging a useEffect loop"');
		const title = await generateChatTitle(
			[
				{ role: "USER", content: "why does my useEffect run twice", hasImage: true },
				{ role: "ASSISTANT", content: "That's StrictMode in development." },
			],
			fetchImpl,
		);

		assert.equal(title, "Debugging a useEffect loop");
		const call = (fetchImpl as unknown as ReturnType<typeof mock.fn>).mock.calls[0];
		const body = JSON.parse((call.arguments[1] as { body: string }).body) as {
			model: string;
			max_tokens: number;
			messages: Array<{ content: string }>;
		};
		assert.equal(body.model, "gpt-4.1-mini");
		assert.equal(body.max_tokens, 24);
		assert.match(body.messages[1].content, /why does my useEffect run twice/);
		assert.match(body.messages[1].content, /\[shared an image\]/);
	});

	it("returns null on empty input, failed requests, and missing output", async () => {
		const emptyFetch = mock.fn(async () =>
			Response.json({ choices: [] }),
		) as unknown as typeof fetch;
		assert.equal(await generateChatTitle([], emptyFetch), null);
		assert.equal((emptyFetch as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);

		const failedFetch = mock.fn(
			async () => new Response("nope", { status: 429 }),
		) as unknown as typeof fetch;
		assert.equal(await generateChatTitle([{ role: "USER", content: "hi" }], failedFetch), null);

		const missingFetch = mock.fn(async () =>
			Response.json({ choices: [] }),
		) as unknown as typeof fetch;
		assert.equal(await generateChatTitle([{ role: "USER", content: "hi" }], missingFetch), null);
	});

	it("returns null when provider request throws", async () => {
		const fetchImpl = mock.fn(async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		assert.equal(await generateChatTitle([{ role: "USER", content: "hi" }], fetchImpl), null);
	});
});
