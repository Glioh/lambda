import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { decideRoute } from "@/modules/routing";
import { CHAT_PROMPT } from "@/prompt";
import z from "zod";

const CHAT_MODEL = "gpt-4.1";
const DEFAULT_TIMEOUT_MS = 30_000;
const HISTORY_LIMIT = 20;

const inputSchema = z.object({
	value: z
		.string()
		.min(1, { message: "Message cannot be empty." })
		.max(10000, "Prompt is too long"),
	projectId: z.string().min(1, { message: "Project ID is required." }),
});

type ChatRole = "system" | "user" | "assistant";

interface ChatCompletionMessage {
	role: ChatRole;
	content: string;
}

interface StreamChunk {
	choices?: Array<{
		delta?: {
			content?: string | null;
		};
	}>;
}

type ChatCompletionStream = AsyncIterable<StreamChunk>;

interface OpenAIChatClient {
	chat: {
		completions: {
			create: (
				body: {
					model: string;
					messages: ChatCompletionMessage[];
					stream: true;
				},
				options?: { signal?: AbortSignal },
			) => Promise<ChatCompletionStream>;
		};
	};
}

interface ChatPrismaClient {
	project: {
		findUnique: (args: {
			where: { id: string; userId: string };
			select: { id: true };
		}) => Promise<{ id: string } | null>;
	};
	message: {
		findMany: (args: {
			where: { projectId: string };
			orderBy: { createdAt: "desc" };
			take: number;
			select: { role: true; content: true };
		}) => Promise<Array<{ role: "USER" | "ASSISTANT"; content: string }>>;
		create: (args: {
			data: {
				projectId: string;
				content: string;
				role: "ASSISTANT";
				type: "RESULT" | "ERROR";
			};
		}) => Promise<unknown>;
	};
}

interface ChatRouteDependencies {
	auth: typeof auth;
	prisma: ChatPrismaClient;
	decideRoute: typeof decideRoute;
	createOpenAIClient: () => Promise<OpenAIChatClient>;
	timeoutMs: number;
}

const encoder = new TextEncoder();

/**
 * Encodes a chat token or completion marker as an SSE data frame.
 */
const encodeData = (data: { token: string } | "[DONE]") => {
	if (data === "[DONE]") {
		return encoder.encode("data: [DONE]\n\n");
	}

	return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
};

/**
 * Encodes an SSE error frame for the chat stream.
 */
const encodeError = (message: string) =>
	encoder.encode(
		`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`,
	);

/**
 * Encodes an SSE status event for the chat stream.
 */
const encodeStatus = (status: string) =>
	encoder.encode(`event: status\ndata: ${JSON.stringify({ status })}\n\n`);

/**
 * Converts persisted message roles into OpenAI chat roles.
 */
const toOpenAIRole = (role: "USER" | "ASSISTANT"): "user" | "assistant" =>
	role === "ASSISTANT" ? "assistant" : "user";

/**
 * Resolves after the configured timeout window.
 */
const timeoutAfter = (timeoutMs: number) =>
	new Promise<"timeout">((resolve) => {
		setTimeout(() => resolve("timeout"), timeoutMs);
	});

/**
 * Creates the default OpenAI client used by the chat route.
 */
async function createDefaultOpenAIClient(): Promise<OpenAIChatClient> {
	return createFetchOpenAIClient();
}

/**
 * Builds a minimal OpenAI chat client over fetch.
 */
function createFetchOpenAIClient(): OpenAIChatClient {
	return {
		chat: {
			completions: {
				create: async (body, options) => {
					const response = await fetch(
						"https://api.openai.com/v1/chat/completions",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
							},
							body: JSON.stringify(body),
							signal: options?.signal,
						},
					);

					if (!response.ok || !response.body) {
						throw new Error("OpenAI chat request failed.");
					}

					return parseOpenAIStream(response.body);
				},
			},
		},
	};
}

/**
 * Parses OpenAI's streaming response into JSON chunks.
 */
async function* parseOpenAIStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamChunk> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";

		for (const event of events) {
			for (const line of event.split("\n")) {
				if (!line.startsWith("data: ")) {
					continue;
				}

				const data = line.slice("data: ".length).trim();
				if (!data || data === "[DONE]") {
					continue;
				}

				yield JSON.parse(data) as StreamChunk;
			}
		}
	}
}

/**
 * Creates the authenticated chat POST handler with injectable dependencies.
 * @param {Partial<ChatRouteDependencies>} overrides - Test or runtime overrides.
 * @returns {(request: Request) => Promise<Response>} The POST handler.
 */
export function createChatPostHandler(
	overrides: Partial<ChatRouteDependencies> = {},
) {
	const dependencies: ChatRouteDependencies = {
		auth,
		prisma,
		decideRoute,
		createOpenAIClient: createDefaultOpenAIClient,
		timeoutMs: Number(process.env.CHAT_STREAM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
		...overrides,
	};

	return async function POST(request: Request) {
		const { userId } = await dependencies.auth();

		if (!userId) {
			return Response.json({ error: "Not authenticated" }, { status: 401 });
		}

		const parsedInput = inputSchema.safeParse(await request.json());

		if (!parsedInput.success) {
			return Response.json(
				{ error: parsedInput.error.flatten() },
				{ status: 400 },
			);
		}

		const { value, projectId } = parsedInput.data;

		// Run project lookup and history fetch in parallel — projectId from
		// input is the same value project.id would resolve to.
		const [project, history] = await Promise.all([
			dependencies.prisma.project.findUnique({
				where: { id: projectId, userId },
				select: { id: true },
			}),
			dependencies.prisma.message.findMany({
				where: { projectId },
				orderBy: { createdAt: "desc" },
				take: HISTORY_LIMIT,
				select: { role: true, content: true },
			}),
		]);

		if (!project) {
			return Response.json({ error: "Project not found." }, { status: 404 });
		}

		const routing = dependencies.decideRoute({ value, projectId: project.id });

		if (routing.decision !== "chat") {
			return Response.json(
				{ error: "Chat endpoint only accepts chat-routed messages.", routing },
				{ status: 400 },
			);
		}

		const orderedHistory = history.reverse();
		const messages: ChatCompletionMessage[] = [
			{ role: "system", content: CHAT_PROMPT },
			...orderedHistory.map((message) => ({
				role: toOpenAIRole(message.role),
				content: message.content,
			})),
		];

		const lastMessage = orderedHistory[orderedHistory.length - 1];
		if (lastMessage?.role !== "USER" || lastMessage.content !== value) {
			messages.push({ role: "user", content: value });
		}

		const stream = new ReadableStream<Uint8Array>({
			start: async (controller) => {
				// Emit immediate ack so client sees activity before model TTFT
				controller.enqueue(encodeStatus("thinking"));
				const abortController = new AbortController();
				let content = "";

				const runCompletion = async () => {
					const openai = await dependencies.createOpenAIClient();
					const completionStream = await openai.chat.completions.create(
						{
							model: CHAT_MODEL,
							messages,
							stream: true,
						},
						{ signal: abortController.signal },
					);

					for await (const chunk of completionStream) {
						const token = chunk.choices?.[0]?.delta?.content ?? "";

						if (!token) {
							continue;
						}

						content += token;
						controller.enqueue(encodeData({ token }));
					}

					return "completed" as const;
				};

				const completionPromise = runCompletion();

				try {
					const result = await Promise.race([
						completionPromise,
						timeoutAfter(dependencies.timeoutMs),
					]);

					if (result === "timeout") {
						abortController.abort();
						completionPromise.catch(() => undefined);

						if (content.length > 0) {
							await dependencies.prisma.message.create({
								data: {
									projectId: project.id,
									content,
									role: "ASSISTANT",
									type: "RESULT",
								},
							});
						} else {
							await dependencies.prisma.message.create({
								data: {
									projectId: project.id,
									content: "Chat response timed out. Please try again.",
									role: "ASSISTANT",
									type: "ERROR",
								},
							});
							controller.enqueue(
								encodeError("Chat response timed out. Please try again."),
							);
						}
					} else {
						await dependencies.prisma.message.create({
							data: {
								projectId: project.id,
								content,
								role: "ASSISTANT",
								type: "RESULT",
							},
						});
					}

					controller.enqueue(encodeData("[DONE]"));
					controller.close();
				} catch {
					if (content.length > 0) {
						await dependencies.prisma.message.create({
							data: {
								projectId: project.id,
								content,
								role: "ASSISTANT",
								type: "RESULT",
							},
						});
					} else {
						await dependencies.prisma.message.create({
							data: {
								projectId: project.id,
								content: "Something went wrong. Please try again.",
								role: "ASSISTANT",
								type: "ERROR",
							},
						});
						controller.enqueue(
							encodeError("Something went wrong. Please try again."),
						);
					}

					controller.enqueue(encodeData("[DONE]"));
					controller.close();
				}
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

/**
 * Handles chat requests for the route segment.
 * @param {Request} request - The incoming chat request.
 * @returns {Promise<Response>} The streamed chat response.
 */
export const POST = createChatPostHandler();
