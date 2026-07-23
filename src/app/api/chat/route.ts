import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import {
	DEFAULT_CONTEXT_CONFIG,
	SUMMARY_PREAMBLE,
	buildCompactionMessages,
	buildSummaryContextBlock,
	estimateMessageTokens,
	estimateTokens,
	planContextWindow,
	type ContextConfig,
} from "@/modules/context";
import { decideRoute } from "@/modules/routing";
import { DEV_FAKE_USER_ID, DEV_NO_AUTH } from "@/lib/dev-auth";
import { CHAT_PROMPT } from "@/prompt";
import z from "zod";

const CHAT_MODEL = "gpt-4.1";
const DEFAULT_TIMEOUT_MS = 30_000;

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
				// create.completions.create
				body: {
					model: string;
					messages: ChatCompletionMessage[];
					stream: true;
					max_tokens?: number;
				},
				options?: { signal?: AbortSignal },
			) => Promise<ChatCompletionStream>;
		};
	};
}

// Define a minimal Prisma client interface with only the methods used by the chat route, to avoid coupling to the full PrismaClient type.
interface ChatPrismaClient {
	project: {
		findUnique: (args: {
			where: { id: string; userId: string };
			select: { id: true };
		}) => Promise<{ id: string } | null>;
	};
	message: {
		findFirst: (args: {
			where: { projectId: string; type: "SUMMARY" };
			orderBy: { createdAt: "desc" };
			select: { content: true; createdAt: true };
		}) => Promise<{ content: string; createdAt: Date } | null>; // The latest compaction checkpoint, if any
		findMany: (args: {
			where: {
				projectId: string;
				type: { not: "SUMMARY" };
				createdAt?: { gt: Date };
			};
			orderBy: { createdAt: "desc" };
			take: number;
			select: { role: true; content: true; createdAt: true };
		}) => Promise<
			Array<{ role: "USER" | "ASSISTANT"; content: string; createdAt: Date }>
		>; // Promise resolves to array of role, content, and createdAt
		create: (args: {
			data: {
				projectId: string;
				content: string; // The content of the message, either user input or assistant response.
				role: "ASSISTANT";
				type: "RESULT" | "ERROR" | "SUMMARY";
				createdAt?: Date; // Explicit timestamp for SUMMARY checkpoints (boundary placement).
			};
		}) => Promise<unknown>; // Prisma will return the created message object, but we don't need to type it here since we don't use the return value - use unknown
	};
}

// Define the dependencies for the chat route handler, allowing for easier testing and separation of concerns.
interface ChatRouteDependencies {
	auth: typeof auth;
	prisma: ChatPrismaClient;
	decideRoute: typeof decideRoute;
	createOpenAIClient: () => Promise<OpenAIChatClient>;
	timeoutMs: number;
	contextConfig: ContextConfig;
}

// SSE is technology that allows for streaming real time data to clients.
// Chat route uses SSE which require sending data as bytes. encoder converts JSON into uint8Array
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
 * Takes in "USER" or "ASSISTANT" from the database and returns "user" or "assistant" for OpenAI API.
 */
const toOpenAIRole = (role: "USER" | "ASSISTANT"): "user" | "assistant" =>
	role === "ASSISTANT" ? "assistant" : "user";

/**
 * Resolves after the configured timeout window. Used to race against the OpenAI completion stream to enforce a maximum response time for the chat route.
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
 * Returns object matching the OpenAIChatClient interface, with a chat.completions.create method that calls the OpenAI API and returns an async generator for streaming responses.
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
						}, // response.body is a stream of data coming from openai
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
	body: ReadableStream<Uint8Array>, // ReadableStream whose chunks are Uint8Arrays of bytes
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
		timeoutMs: Number(DEFAULT_TIMEOUT_MS),
		contextConfig: DEFAULT_CONTEXT_CONFIG,
		...overrides,
	};

	return async function POST(request: Request) {
		const { userId: authUserId } = await dependencies.auth();
		const userId =
			authUserId ?? (DEV_NO_AUTH ? DEV_FAKE_USER_ID : null);

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

		// Run project lookup and checkpoint fetch in parallel — projectId from
		// input is the same value project.id would resolve to.
		const [project, latestCheckpoint] = await Promise.all([
			dependencies.prisma.project.findUnique({
				where: { id: projectId, userId },
				select: { id: true },
			}),
			dependencies.prisma.message.findFirst({
				where: { projectId, type: "SUMMARY" },
				orderBy: { createdAt: "desc" },
				select: { content: true, createdAt: true },
			}),
		]);

		if (!project) {
			return Response.json({ error: "Project not found." }, { status: 404 });
		}

		// Build or chat?
		const routing = dependencies.decideRoute({ value, projectId: project.id });

		if (routing.decision !== "chat") {
			return Response.json(
				{ error: "Chat endpoint only accepts chat-routed messages.", routing },
				{ status: 400 },
			);
		}

		// Active history starts after the latest compaction checkpoint (opencode-style):
		// older messages stay in the database but are only visible through the summary.
		const history = await dependencies.prisma.message.findMany({
			where: {
				projectId,
				type: { not: "SUMMARY" },
				...(latestCheckpoint
					? { createdAt: { gt: latestCheckpoint.createdAt } }
					: {}),
			},
			orderBy: { createdAt: "desc" },
			take: dependencies.contextConfig.historyFetchCap,
			select: { role: true, content: true, createdAt: true }, // createdAt needed to place the checkpoint boundary
		});

		const orderedHistory = history.reverse();

		// The checkpoint content evolves if compaction runs during this request.
		let summaryContent = latestCheckpoint?.content ?? null;

		// Estimate the request pieces that are always present, then let the
		// window planner decide whether we fit or need to compact first.
		const fixedTokens =
			estimateMessageTokens(CHAT_PROMPT) +
			estimateMessageTokens(value) +
			(summaryContent ? estimateTokens(SUMMARY_PREAMBLE) : 0);

		const plan = planContextWindow({
			summaryContent,
			messages: orderedHistory,
			fixedTokens,
			config: dependencies.contextConfig,
		});

		/**
		 * Builds the provider messages from the (possibly updated) checkpoint
		 * and the verbatim tail of recent messages.
		 */
		const buildMessages = (): ChatCompletionMessage[] => {
			const messages: ChatCompletionMessage[] = [
				{ role: "system", content: CHAT_PROMPT },
			];

			if (summaryContent) {
				messages.push({
					role: "user",
					content: buildSummaryContextBlock(summaryContent),
				});
			}

			for (const message of plan.tail) {
				messages.push({
					role: toOpenAIRole(message.role),
					content: message.content,
				});
			}

			const lastMessage = plan.tail[plan.tail.length - 1];
			if (lastMessage?.role !== "USER" || lastMessage.content !== value) {
				messages.push({ role: "user", content: value });
			}

			return messages;
		};

		const stream = new ReadableStream<Uint8Array>({
			start: async (controller) => {
				// Emit immediate ack so client sees activity before model TTFT
				controller.enqueue(encodeStatus("thinking"));
				const abortController = new AbortController();
				let content = "";

				const runCompletion = async () => {
					const openai = await dependencies.createOpenAIClient();

					if (plan.needsCompaction) {
						// Fold the head of the conversation into a checkpoint before
						// answering. Failure here must never block the user's answer —
						// we fall back to sending the tail without an updated summary.
						controller.enqueue(encodeStatus("compacting"));

						try {
							const summaryStream = await openai.chat.completions.create(
								{
									model: CHAT_MODEL,
									messages: buildCompactionMessages(summaryContent, plan.head),
									stream: true,
									max_tokens: dependencies.contextConfig.summaryMaxTokens,
								},
								{ signal: abortController.signal },
							);

							let summaryText = "";
							for await (const chunk of summaryStream) {
								summaryText += chunk.choices?.[0]?.delta?.content ?? "";
							}
							summaryText = summaryText.trim();

							if (summaryText) {
								// Place the checkpoint boundary at the newest FOLDED message.
								// Future history loads use `createdAt > checkpoint`, so the
								// verbatim tail (which is newer than the head) stays in the
								// active window instead of being orphaned behind the checkpoint.
								const boundaryCreatedAt =
									plan.head[plan.head.length - 1]?.createdAt;

								await dependencies.prisma.message.create({
									data: {
										projectId: project.id,
										content: summaryText,
										role: "ASSISTANT",
										type: "SUMMARY",
										...(boundaryCreatedAt
											? { createdAt: boundaryCreatedAt }
											: {}),
									},
								});
								summaryContent = summaryText;
							}
						} catch (error) {
							console.error(
								"Context compaction failed; continuing without checkpoint update.",
								error,
							);
						}
					}

					const completionStream = await openai.chat.completions.create(
						{
							model: CHAT_MODEL,
							messages: buildMessages(),
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
