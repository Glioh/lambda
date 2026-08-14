import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChatPostHandler } from "@/app/api/chat/route";
import type {
	ChatCompletionEvent,
	CompleteChatInput,
} from "@/modules/chats/server/completion";

function createRequest(body = { projectId: "project_1", messageId: "message_1" }) {
	return new Request("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function createHandler(options: {
	authUserId?: string | null;
	result?:
		| { kind: "not-found" }
		| {
				kind: "started";
				events: AsyncIterable<ChatCompletionEvent>;
		  };
} = {}) {
	const calls: Array<{ userId: string; projectId: string; messageId: string }> = [];
	const authUserId =
		options.authUserId === undefined ? "user_1" : options.authUserId;
	const POST = createChatPostHandler({
		auth: (async () => ({ userId: authUserId })) as any,
		completeChat: (async (input: CompleteChatInput) => {
			calls.push({
				userId: input.userId,
				projectId: input.projectId,
				messageId: input.messageId,
			});
			if (options.result) return options.result as any;
			return {
				kind: "started",
				events: (async function* (): AsyncIterable<ChatCompletionEvent> {
					yield { kind: "thinking" };
					yield { kind: "token", token: "Hello" };
					yield { kind: "done" };
				})(),
			};
		}) as any,
	});

	return { POST, calls };
}

describe("POST /api/chat", () => {
	it("passes the authenticated user and persisted identifiers to the completion interface", async () => {
		const { POST, calls } = createHandler();
		const response = await POST(createRequest());
		await response.text();

		assert.equal(response.status, 200);
		assert.deepEqual(calls, [
			{ userId: "user_1", projectId: "project_1", messageId: "message_1" },
		]);
	});

	it("rejects unauthenticated requests", async () => {
		const { POST } = createHandler({ authUserId: null });
		const response = await POST(createRequest());

		assert.equal(response.status, 401);
		assert.match(await response.text(), /Not authenticated/);
	});

	it("rejects malformed input with a 400 response", async () => {
		const { POST } = createHandler();
		const response = await POST(createRequest({ projectId: "", messageId: "" }));

		assert.equal(response.status, 400);
		assert.match(await response.text(), /Project ID is required|Message ID is required/);
	});

	it("rejects malformed JSON with a 400 response", async () => {
		const { POST } = createHandler();
		const response = await POST(
			new Request("http://localhost/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{",
			}),
		);

		assert.equal(response.status, 400);
		assert.match(await response.text(), /Invalid JSON body/);
	});

	it("maps a not-found completion result to a 404 HTTP response", async () => {
		const { POST } = createHandler({ result: { kind: "not-found" } });
		const response = await POST(createRequest());

		assert.equal(response.status, 404);
		assert.match(await response.text(), /Project or message not found/);
	});

	it("streams SSE events from the completion interface", async () => {
		const { POST } = createHandler({
			result: {
				kind: "started",
				events: (async function* () {
					yield { kind: "thinking" };
					yield { kind: "token", token: "Hello" };
					yield { kind: "error", message: "Nope" };
					yield { kind: "done" };
				})(),
			},
		});

		const response = await POST(createRequest());
		const text = await response.text();

		assert.equal(response.status, 200);
		assert.match(response.headers.get("Content-Type") ?? "", /text\/event-stream/);
		assert.match(text, /event: status\ndata: \{"status":"thinking"\}/);
		assert.match(text, /data: \{"token":"Hello"\}/);
		assert.match(text, /event: error\ndata: \{"error":"Nope"\}/);
		assert.match(text, /data: \[DONE\]/);
	});
});
