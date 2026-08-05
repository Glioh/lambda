import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import {
	DEFAULT_CONTEXT_CONFIG,
	SUMMARY_PREAMBLE,
	buildCompactionMessages,
	buildSummaryContextBlock,
	estimateImageTokens,
	estimateMessageTokens,
	estimateTokens,
	planContextWindow,
	type ContextConfig,
} from "@/modules/context";
import { DEV_FAKE_USER_ID, DEV_NO_AUTH } from "@/lib/dev-auth";
import { CHAT_PROMPT } from "@/prompt";
import { after } from "next/server";
import z from "zod";

const CHAT_MODEL = "gpt-4.1";

/**
 * Reads a positive integer from the environment, falling back when unset or
 * malformed. Bare `Number()` would turn a typo into NaN, and `setTimeout(NaN)`
 * fires immediately — a mistyped timeout would abort every request instantly.
 * @param {string} name - The environment variable to read.
 * @param {number} fallback - Value used when unset or invalid.
 * @returns {number} The resolved timeout in milliseconds.
 */
const envMs = (name: string, fallback: number): number => {
	const parsed = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_TIMEOUT_MS = envMs("CHAT_TIMEOUT_MS", 45_000);
/**
 * Vision requests carrying several images routinely take far longer to first
 * token than text-only ones, so they get a longer leash rather than being
 * killed mid-answer.
 */
const VISION_TIMEOUT_MS = envMs("CHAT_VISION_TIMEOUT_MS", 90_000);

export const runtime = "nodejs";
export const maxDuration = 120;

const inputSchema = z
	.object({
		value: z.string().max(10000, "Prompt is too long"),
		projectId: z.string().min(1, { message: "Project ID is required." }),
		/**
		 * Set when the pending user message carries images but no text. The images
		 * themselves are read from the database — see the history load below.
		 */
		hasAttachments: z.boolean().optional(),
	})
	.refine(
		(input) => input.value.trim().length > 0 || input.hasAttachments === true,
		{ message: "Message cannot be empty.", path: ["value"] },
	);

type ChatRole = "system" | "user" | "assistant";

type ContentPart =
	| { type: "text"; text: string }
	| {
			type: "image_url";
			image_url: { url: string; detail: "auto" | "low" | "high" };
	  };

interface ChatCompletionMessage {
	role: ChatRole;
	/**
	 * A plain string whenever the message has no images. Only image-bearing
	 * turns use the multipart form, so the common path stays simple.
	 */
	content: string | ContentPart[];
}

/** Attachment metadata carried alongside history. Never includes the payload. */
interface HistoryAttachment {
	id: string;
	mimeType: string;
	width: number;
	height: number;
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
					messages: Array<{
						role: ChatRole;
						content: string | ContentPart[];
					}>;
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
			select: {
				role: true;
				content: true;
				createdAt: true;
				// Metadata ONLY. `data` is deliberately absent: it is TOASTed base64
				// and must never be pulled for every message in the window.
				attachments: {
					select: { id: true; mimeType: true; width: true; height: true };
					orderBy: { createdAt: "asc" };
				};
			};
		}) => Promise<
			Array<{
				role: "USER" | "ASSISTANT";
				content: string;
				createdAt: Date;
				// Optional so existing test harnesses without attachments still fit.
				attachments?: HistoryAttachment[];
			}>
		>; // Promise resolves to array of role, content, createdAt, and image metadata
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
	/**
	 * Second-phase fetch: pulls payloads for only the handful of images that will
	 * actually be sent, keeping the per-message history load metadata-only.
	 */
	attachment: {
		findMany: (args: {
			where: { id: { in: string[] } };
			select: { id: true; mimeType: true; data: true };
		}) => Promise<Array<{ id: string; mimeType: string; data: string }>>;
	};
}

// Define the dependencies for the chat route handler, allowing for easier testing and separation of concerns.
interface ChatRouteDependencies {
	auth: typeof auth;
	prisma: ChatPrismaClient;
	createOpenAIClient: () => Promise<OpenAIChatClient>;
	timeoutMs: number;
	contextConfig: ContextConfig;
	/**
	 * Runs work after the response is done. Defaults to Next's `after`, which
	 * needs a request scope — injectable so route tests can call the handler with
	 * a plain Request and still observe the post-disconnect write.
	 */
	scheduleAfterResponse: (task: () => Promise<void>) => void;
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
 * Resolves after the configured timeout window. Used to race against the OpenAI
 * completion stream to enforce a maximum response time for the chat route.
 *
 * Returns a `cancel` alongside the promise: losing the race must clear the
 * timer, or every completed request would hold a live timer (and its closure)
 * for the rest of the window.
 * @param {number} timeoutMs - How long to wait before resolving.
 * @returns {{ promise: Promise<"timeout">; cancel: () => void }} The race entrant.
 */
const timeoutAfter = (timeoutMs: number) => {
	let timer: ReturnType<typeof setTimeout>;

	const promise = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), timeoutMs);
	});

	return { promise, cancel: () => clearTimeout(timer) };
};

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
		createOpenAIClient: createDefaultOpenAIClient,
		timeoutMs: Number(DEFAULT_TIMEOUT_MS),
		contextConfig: DEFAULT_CONTEXT_CONFIG,
		scheduleAfterResponse: after,
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
			select: {
				role: true,
				content: true,
				createdAt: true, // needed to place the checkpoint boundary
				// Metadata only — payloads are fetched below for the selected few.
				attachments: {
					select: { id: true, mimeType: true, width: true, height: true },
					orderBy: { createdAt: "asc" },
				},
			},
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

		/**
		 * Token cost of a message's images, computed from stored dimensions so the
		 * base64 payload never reaches the chars/4 text estimator.
		 */
		const imageTokensFor = (message: {
			attachments?: HistoryAttachment[];
		}): number =>
			(message.attachments ?? []).reduce(
				(total, attachment) =>
					total + estimateImageTokens(attachment.width, attachment.height),
				0,
			);

		const plan = planContextWindow({
			summaryContent,
			messages: orderedHistory,
			fixedTokens,
			config: dependencies.contextConfig,
			extraTokens: imageTokensFor,
		});

		// Only the tail survives verbatim, so only it can carry images. Walk it
		// newest-first up to the cap; anything older degrades to a text marker.
		const selectedImageIds = new Set<string>();
		const { maxImagesInContext } = dependencies.contextConfig;

		for (
			let index = plan.tail.length - 1;
			index >= 0 && selectedImageIds.size < maxImagesInContext;
			index -= 1
		) {
			for (const attachment of plan.tail[index].attachments ?? []) {
				if (selectedImageIds.size >= maxImagesInContext) {
					break;
				}

				selectedImageIds.add(attachment.id);
			}
		}

		// Guarded so a history with no images never touches `prisma.attachment`.
		const imageDataUrls = new Map<string, string>();

		if (selectedImageIds.size > 0) {
			const rows = await dependencies.prisma.attachment.findMany({
				where: { id: { in: [...selectedImageIds] } },
				select: { id: true, mimeType: true, data: true },
			});

			for (const row of rows) {
				imageDataUrls.set(row.id, `data:${row.mimeType};base64,${row.data}`);
			}
		}

		/**
		 * Renders one persisted message as provider content.
		 *
		 * Returns a PLAIN STRING when there are no images: the string form is what
		 * the rest of the pipeline assumes, and only image-bearing turns need the
		 * multipart form.
		 */
		const toContent = (message: {
			content: string;
			attachments?: HistoryAttachment[];
		}): string | ContentPart[] => {
			const attachments = message.attachments ?? [];

			if (attachments.length === 0) {
				return message.content;
			}

			const parts: ContentPart[] = [];

			if (message.content.trim()) {
				parts.push({ type: "text", text: message.content });
			}

			for (const attachment of attachments) {
				const url = imageDataUrls.get(attachment.id);

				if (url) {
					parts.push({
						type: "image_url",
						image_url: { url, detail: "high" },
					});
				} else {
					// Past the image cap: keep the model aware that something was
					// shared here without paying for the pixels again.
					parts.push({
						type: "text",
						text: `[image omitted from context: ${attachment.mimeType} ${attachment.width}×${attachment.height}]`,
					});
				}
			}

			return parts;
		};

		/**
		 * Builds the provider messages from the (possibly updated) checkpoint and
		 * the verbatim tail of recent messages.
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
					content: toContent(message),
				});
			}

			const lastMessage = plan.tail[plan.tail.length - 1];
			if (lastMessage?.role !== "USER" || lastMessage.content !== value) {
				messages.push({ role: "user", content: value });
			}

			return messages;
		};

		// Hoisted out of `start` so the disconnect handlers below — which run after
		// `start` has returned — can abort the upstream call and persist whatever
		// streamed before the client went away.
		const abortController = new AbortController();
		let content = "";
		let persisted = false;
		let clientGone = false;

		/**
		 * Writes the assistant row at most once, whichever exit path wins the race
		 * between normal completion, timeout, error, and client disconnect.
		 */
		const persistOnce = async (
			text: string,
			type: "RESULT" | "ERROR",
		): Promise<void> => {
			if (persisted) {
				return;
			}

			// Claimed before awaiting so concurrent exit paths can't double-write,
			// but released again on failure — otherwise a rejected insert would
			// silently block every remaining path from saving the answer at all.
			persisted = true;

			try {
				await dependencies.prisma.message.create({
					data: {
						projectId: project.id,
						content: text,
						role: "ASSISTANT",
						type,
					},
				});
			} catch (error) {
				persisted = false;
				throw error;
			}
		};

		/** Closing an already-closed or errored controller throws; swallow that. */
		const closeOnce = (
			controller: ReadableStreamDefaultController<Uint8Array>,
		) => {
			try {
				controller.close();
			} catch {
				// Already closed — nothing to do.
			}
		};

		/**
		 * Handles the user pressing stop (or navigating away): tear down the
		 * upstream request so we stop paying for tokens, then persist whatever
		 * already streamed so the partial answer survives a reload.
		 */
		const onClientGone = () => {
			if (clientGone) {
				return;
			}

			clientGone = true;
			abortController.abort();

			// The response stream is dead, so the write can't be awaited inline —
			// hand it to the platform so the function isn't frozen before the
			// INSERT lands. Nothing streamed means nothing worth saving.
			if (content.length > 0) {
				dependencies.scheduleAfterResponse(async () => {
					try {
						await persistOnce(content, "RESULT");
					} catch (error) {
						console.error(
							"Failed to persist partial response after client disconnect.",
							error,
						);
					}
				});
			}
		};

		request.signal.addEventListener("abort", onClientGone, { once: true });

		const stream = new ReadableStream<Uint8Array>({
			start: async (controller) => {
				/** Enqueue that no-ops once the consumer is gone. */
				const safeEnqueue = (chunk: Uint8Array) => {
					if (clientGone) {
						return;
					}

					try {
						controller.enqueue(chunk);
					} catch {
						clientGone = true;
					}
				};

				// Emit immediate ack so client sees activity before model TTFT
				safeEnqueue(encodeStatus("thinking"));

				const runCompletion = async () => {
					const openai = await dependencies.createOpenAIClient();

					if (plan.needsCompaction) {
						// Fold the head of the conversation into a checkpoint before
						// answering. Failure here must never block the user's answer —
						// we fall back to sending the tail without an updated summary.
						safeEnqueue(encodeStatus("compacting"));

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
						safeEnqueue(encodeData({ token }));
					}

					return "completed" as const;
				};

				const completionPromise = runCompletion();

				// Tests inject a tiny timeout and no images, so they're unaffected.
				const effectiveTimeoutMs =
					selectedImageIds.size > 0
						? Math.max(dependencies.timeoutMs, VISION_TIMEOUT_MS)
						: dependencies.timeoutMs;

				const timeout = timeoutAfter(effectiveTimeoutMs);

				try {
					const result = await Promise.race([
						completionPromise,
						timeout.promise,
					]).finally(timeout.cancel);

					if (result === "timeout") {
						abortController.abort();
						completionPromise.catch(() => undefined);

						if (content.length > 0) {
							await persistOnce(content, "RESULT");
						} else {
							await persistOnce(
								"Chat response timed out. Please try again.",
								"ERROR",
							);
							safeEnqueue(
								encodeError("Chat response timed out. Please try again."),
							);
						}
					} else if (content.length > 0) {
						// Matches the disconnect and timeout paths: an empty completion
						// has nothing worth saving, and an empty row would render as a
						// blank answer bubble.
						await persistOnce(content, "RESULT");
					}

					safeEnqueue(encodeData("[DONE]"));
					closeOnce(controller);
				} catch {
					if (clientGone) {
						// The user stopped generation. `onClientGone` owns the write so it
						// still happens after this stream is torn down; adding an ERROR row
						// here would contradict the partial answer we just saved.
						closeOnce(controller);
						return;
					}

					if (content.length > 0) {
						await persistOnce(content, "RESULT");
					} else {
						await persistOnce(
							"Something went wrong. Please try again.",
							"ERROR",
						);
						safeEnqueue(
							encodeError("Something went wrong. Please try again."),
						);
					}

					safeEnqueue(encodeData("[DONE]"));
					closeOnce(controller);
				}
			},
			// Fires when the consumer tears the stream down in-process. The
			// request-signal listener below covers the over-the-wire disconnect.
			cancel: () => onClientGone(),
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
