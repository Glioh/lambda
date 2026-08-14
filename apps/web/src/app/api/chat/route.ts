import { auth } from "@clerk/nextjs/server";
import { DEV_FAKE_USER_ID, DEV_NO_AUTH } from "@/lib/dev-auth";
import type {
	ChatCompletionResult,
	CompleteChatInput,
} from "@/modules/chats/server/completion";
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

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const pump = async () => {
					try {
						for await (const event of result.events) {
							switch (event.kind) {
								case "thinking":
									controller.enqueue(encodeStatus("thinking"));
									break;
								case "compacting":
									controller.enqueue(encodeStatus("compacting"));
									break;
								case "token":
									controller.enqueue(encodeData({ token: event.token }));
									break;
								case "error":
									controller.enqueue(encodeError(event.message));
									break;
								case "done":
									controller.enqueue(encodeData("[DONE]"));
									controller.close();
									return;
								default:
									break;
								}
						}

						controller.enqueue(encodeData("[DONE]"));
						controller.close();
					} catch {
						if (request.signal.aborted) {
							try {
								controller.close();
							} catch {
								// Already closed.
							}
							return;
						}

						controller.enqueue(
							encodeError("Something went wrong. Please try again."),
						);
						controller.enqueue(encodeData("[DONE]"));
						try {
							controller.close();
						} catch {
							// Already closed.
						}
					}
				};

				void pump();
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
