import { auth } from "@clerk/nextjs/server";
import type { ChatCompletionEvent, ChatCompletionResult, CompleteChatInput, } from "@/modules/chats/server/completion";
import z from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const inputSchema = z.object({
	projectId: z.string().trim().min(1, { message: "Project ID is required." }),
	messageId: z.string().trim().min(1, { message: "Message ID is required." }),
});

const encoder = new TextEncoder();

const encodeData = (data: { token: string } | "[DONE]") => {
	if (data === "[DONE]") {
		return encoder.encode("data: [DONE]\n\n");
	}

	return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
};

const encodeError = (message: string) =>
	encoder.encode(`event: error
data: ${JSON.stringify({ error: message })}\n\n`);

const encodeStatus = (status: string) =>
	encoder.encode(`event: status
data: ${JSON.stringify({ status })}\n\n`);

export interface ChatRouteDependencies {
	auth: typeof auth;
	completeChat: (input: CompleteChatInput) => Promise<ChatCompletionResult>;
}

export function createChatPostHandler(
	overrides: Partial<ChatRouteDependencies> = {},
) {
	const dependencies: ChatRouteDependencies = {
		auth,
		completeChat: async (input: CompleteChatInput) =>
			(await import("@/modules/chats/server/completion")).completeChat(input),
		...overrides,
	};

	return async function POST(request: Request) {
		const { userId: authUserId } = await dependencies.auth();
		const userId = authUserId ?? (DEV_NO_AUTH ? DEV_FAKE_USER_ID : null);

		if (!userId) {
			return Response.json({ error: "Not authenticated" }, { status: 401 });
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return Response.json({ error: "Invalid JSON body." }, { status: 400 });
		}

		const parsedInput = inputSchema.safeParse(body);
		if (!parsedInput.success) {
			return Response.json(
				{
					error: "Invalid request body.",
					details: parsedInput.error.flatten(),
				},
				{ status: 400 },
			);
		}

		const { projectId, messageId } = parsedInput.data;
		const result = await dependencies.completeChat({
			userId,
			projectId,
			messageId,
			signal: request.signal,
		});

		if (result.kind === "not-found") {
			return Response.json(
				{ error: "Project or message not found." },
				{ status: 404 },
			);
		}

			let iterator: AsyncIterator<ChatCompletionEvent> | null = null;
			let cancelled = false;
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					iterator = result.events[Symbol.asyncIterator]();
					const enqueue = (data: Uint8Array): boolean => {
						if (cancelled || request.signal.aborted) return false;
						try {
							controller.enqueue(data);
							return true;
						} catch {
							cancelled = true;
							return false;
						}
					};
					const close = () => {
						try {
							controller.close();
						} catch {
							// Consumer already cancelled or stream already closed.
						}
					};
					const pump = async () => {
						try {
							while (!cancelled && !request.signal.aborted) {
								const next = await iterator?.next();
								if (!next || next.done) {
									enqueue(encodeData("[DONE]"));
									close();
									return;
								}
								const event = next.value;
								switch (event.kind) {
									case "thinking":
										enqueue(encodeStatus("thinking"));
										break;
									case "compacting":
										enqueue(encodeStatus("compacting"));
										break;
									case "token":
										enqueue(encodeData({ token: event.token }));
										break;
									case "error":
										enqueue(encodeError(event.message));
										break;
									case "done":
										enqueue(encodeData("[DONE]"));
										close();
										return;
								default:
									break;
								}
						}

						} catch {
							if (cancelled || request.signal.aborted) {
								close();
								return;
							}

							enqueue(
								encodeError("Something went wrong. Please try again."),
							);
							enqueue(encodeData("[DONE]"));
							close();
						} finally {
							iterator = null;
						}
					};

					void pump();
				},
				cancel() {
					cancelled = true;
					const activeIterator = iterator;
					iterator = null;
					void activeIterator?.return?.().catch(() => undefined);
				},
			});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
			},
		});
	};
}

export const POST = createChatPostHandler();
