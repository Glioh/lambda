import { streamChatCompletion } from "@/lib/chat-stream";
import { useTRPC } from "@/trpc/client";
import {
	useSuspenseQuery,
	useQueryClient,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { MessageCard } from "./message-card";
import { MessageForm } from "./message-form";
import { ScrollToBottomButton } from "./scroll-to-bottom-button";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageType } from "@prisma/client";
import { MessageLoading } from "./message-loading";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { shouldAutoStartResponse } from "@/modules/projects/lib/auto-start";
import { toast } from "sonner";

/** Poll cadence while a response is in flight. Idle threads don't poll at all. */
const STREAMING_POLL_MS = 1500;

interface Props {
	projectId: string;
}

/**
 * Coordinates the message list, streaming preview, and message composer.
 * @param {Props} props - The container props.
 * @returns {JSX.Element} The rendered messages container.
 */
export const MessagesContainer = ({ projectId }: Props) => {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();
	const hasInitializedStreamRef = useRef<boolean>(false);
	const autoStartAbortRef = useRef<AbortController | null>(null);
	const [streamingMessage, setStreamingMessage] = useState<{
		content: string;
		type: MessageType;
		isStreaming: boolean;
		status?: string;
	} | null>(null);
	// True from the moment the user presses stop until they send again.
	//
	// This is load-bearing: a stopped turn leaves the thread ending on a USER
	// message, which is exactly the shape the auto-start effect below treats as
	// "needs an answer". Without this flag it immediately re-streams the prompt
	// the user just interrupted.
	const [stopped, setStopped] = useState(false);
	/** Id of the user message currently open in the inline editor, if any. */
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

	const { data: messages } = useSuspenseQuery(
		trpc.messages.getMany.queryOptions(
			{
				projectId: projectId,
			},
			{
				// Only poll while a response is actually in flight. Idle polling
				// re-serialized the whole transcript every 1.5s forever, which grows
				// with the conversation and buys nothing once the answer has landed.
				refetchInterval: streamingMessage ? STREAMING_POLL_MS : false,
				staleTime: 5_000,
			},
		),
	);

	const lastMessage = messages[messages.length - 1];
	const isLastMessageUser = lastMessage?.role === "USER";

	const { scrollRef, handleScroll, isAtBottom, scrollToBottom } =
		useStickToBottom<HTMLDivElement>([
			messages.length,
			streamingMessage?.content,
		]);

	/**
	 * Marks the stream as stopped. The partial answer is frozen in place (rather
	 * than cleared) so the text doesn't blink out while the server's write is in
	 * flight; nothing streamed means nothing is saved, so there the preview just
	 * goes away.
	 */
	const handleStopped = useCallback(() => {
		setStopped(true);
		setStreamingMessage((current) =>
			current?.content
				? { ...current, isStreaming: false, status: undefined }
				: null,
		);
	}, []);

	// Swap the frozen preview for the persisted row the moment it arrives.
	//
	// Keyed off "the thread no longer ends on a USER message" rather than a
	// message count: counting raced the refetch that MessageForm already performs
	// before reporting the stop, which could leave the preview stuck on screen
	// next to an identical saved row.
	//
	// Adjusting state during render is React's supported pattern for this; it
	// re-renders before paint, so the duplicate is never visible.
	if (stopped && !isLastMessageUser && streamingMessage) {
		setStreamingMessage(null);
		setStopped(false);
	}

	/** Aborts the auto-started stream, if that's the one running. */
	const stopAutoStartedStream = useCallback(() => {
		autoStartAbortRef.current?.abort();
	}, []);

	// Unmount-only: switching chats remounts this component (it's keyed by
	// projectId), and an orphaned stream would keep writing into a view nobody
	// is looking at. Deliberately separate from the streaming effect so a
	// dependency change can't abort a stream that is still live.
	useEffect(
		() => () => {
			const controller = autoStartAbortRef.current;

			if (controller) {
				// React Strict Mode replays effects as setup -> cleanup -> setup in
				// development. Re-arm auto-start before aborting so that replay can
				// replace this lifecycle-cancelled stream. A user stop deliberately
				// leaves the controller current and is handled as a real stop below.
				autoStartAbortRef.current = null;
				hasInitializedStreamRef.current = false;
				controller.abort();
			}
		},
		[],
	);

	// Cache hit — ChatHeader already fetched this project for the title bar.
	const { data: project } = useQuery(
		trpc.projects.getOne.queryOptions({ id: projectId }),
	);

	const generateTitle = useMutation(
		trpc.projects.generateTitle.mutationOptions(),
	);

	/**
	 * Names the chat once it has an answer worth naming. The server is the real
	 * guard (it no-ops unless `titleGeneratedAt` is null); this check just avoids
	 * a pointless round trip after every subsequent message.
	 */
	const maybeGenerateTitle = useCallback(() => {
		if (project?.titleGeneratedAt || generateTitle.isPending) {
			return;
		}

		generateTitle.mutate(
			{ id: projectId },
			{
				onSuccess: (result) => {
					if (!result) {
						return;
					}

					// The sidebar lives above this view in the layout and shares the
					// same QueryClient, so invalidating is all it takes to retitle it.
					queryClient.invalidateQueries(
						trpc.projects.getOne.queryOptions({ id: projectId }),
					);
					queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
				},
				// Titling is cosmetic: a failure must never surface as an error toast.
				onError: () => undefined,
			},
		);
	}, [project?.titleGeneratedAt, generateTitle, projectId, queryClient, trpc]);

	const retryFrom = useMutation(trpc.messages.retryFrom.mutationOptions());
	const editAndResend = useMutation(
		trpc.messages.editAndResend.mutationOptions(),
	);

	/**
	 * Shared tail of every rollback (retry and edit alike).
	 *
	 * The re-stream isn't kicked off here: once the rollback lands, the thread
	 * ends on a USER message, which is exactly the state the auto-start effect
	 * below already handles. Clearing the stop latch and the init guard is what
	 * re-arms it.
	 */
	const afterRollback = useCallback(async () => {
		setStopped(false);
		setStreamingMessage(null);
		setEditingMessageId(null);
		hasInitializedStreamRef.current = false;

		await queryClient.invalidateQueries(
			trpc.messages.getMany.queryOptions({ projectId }),
		);
		queryClient.invalidateQueries(trpc.usage.status.queryOptions());
	}, [projectId, queryClient, trpc]);

	/** Surfaces a rollback failure, routing to pricing when out of credits. */
	const onRollbackError = useCallback(
		(error: { message: string; data?: { code?: string } | null }) => {
			toast.error(error.message);

			if (error.data?.code === "TOO_MANY_REQUESTS") {
				router.push("/pricing");
			}
		},
		[router],
	);

	/** Rolls the thread back to an answer and re-runs the prompt behind it. */
	const handleRetry = useCallback(
		(messageId: string) => {
			retryFrom.mutate(
				{ projectId, messageId },
				{ onSuccess: afterRollback, onError: onRollbackError },
			);
		},
		[retryFrom, projectId, afterRollback, onRollbackError],
	);

	// One in-flight rollback at a time: both mutations truncate the thread, so
	// letting a second start mid-flight would race two different rollback points.
	const isRollbackBusy =
		!!streamingMessage || retryFrom.isPending || editAndResend.isPending;

	/** Rewrites a user turn, discards everything after it, and re-runs it. */
	const handleSubmitEdit = useCallback(
		(messageId: string, value: string) => {
			editAndResend.mutate(
				{ projectId, messageId, value },
				{ onSuccess: afterRollback, onError: onRollbackError },
			);
		},
		[editAndResend, projectId, afterRollback, onRollbackError],
	);

	// Start streaming response if last message is from user and we aren't already streaming a response
	// This occurs when we type a prompt from the home page it'll trigger this and start streaming the response immediately when we navigate to the project page
	// MessageForm will not trigger streaming since it checks if the message is already sent before starting the stream, so this is a necessary effect to handle that case
	useEffect(() => {
		if (
			shouldAutoStartResponse({
				isLastMessageUser,
				hasStreamingMessage: !!streamingMessage,
				stopped,
				hasInitialized: hasInitializedStreamRef.current,
			})
		) {
			hasInitializedStreamRef.current = true;

			const streamChatResponse = async (
				value: string,
				hasAttachments: boolean,
			) => {
				setStreamingMessage({
					content: "",
					type: "RESULT",
					isStreaming: true,
				});

				const controller = new AbortController();
				autoStartAbortRef.current = controller;

				try {
						// Named to avoid shadowing the `stopped` state this effect guards on.
					const { stopped: wasStopped } = await streamChatCompletion(
						{ value, projectId, hasAttachments },
						{
							onStatus: (status) =>
								setStreamingMessage((current) => ({
									content: current?.content ?? "",
									type: current?.type ?? "RESULT",
									isStreaming: true,
									status,
								})),
							onToken: (token) =>
								setStreamingMessage((current) => ({
									content: `${current?.content ?? ""}${token}`,
									type: current?.type ?? "RESULT",
									isStreaming: true,
								})),
							onError: (message) =>
								setStreamingMessage({
									content: message,
									type: "ERROR",
									isStreaming: false,
								}),
						},
						{ signal: controller.signal },
					);

					if (wasStopped) {
						if (autoStartAbortRef.current !== controller) {
							// Lifecycle cleanup cancelled this attempt. If Strict Mode has
							// already installed its replacement, leave that preview alone;
							// otherwise clear ours so the re-armed effect can start again.
							if (!autoStartAbortRef.current) {
								setStreamingMessage(null);
							}
							return;
						}

						// Same ordering as MessageForm: latch the stop before the refetch
						// re-renders a thread that still ends on the user's message.
						handleStopped();
						await queryClient.invalidateQueries(
							trpc.messages.getMany.queryOptions({ projectId }),
						);
						maybeGenerateTitle();
						return;
					}

					await queryClient.invalidateQueries(
						trpc.messages.getMany.queryOptions({ projectId }),
					);

					setStreamingMessage(null);
					maybeGenerateTitle();
				} catch (error) {
					const errorMessage =
						error instanceof Error
							? error.message
							: "Something went wrong. Please try again.";

					setStreamingMessage({
						content: errorMessage,
						type: "ERROR",
						isStreaming: false,
					});
					toast.error(errorMessage);
					// Re-arm so a failed auto-start can be retried. This has to live
					// here: the catch above swallows the error, so a `.catch()` on the
					// call below could never fire.
					hasInitializedStreamRef.current = false;
				} finally {
					// Only clear our own controller — a newer stream may own it now.
					if (autoStartAbortRef.current === controller) {
						autoStartAbortRef.current = null;
					}
				}
			};

			streamChatResponse(
				lastMessage.content,
				(lastMessage.attachments?.length ?? 0) > 0,
			);
		}
	}, [
		isLastMessageUser,
		streamingMessage,
		stopped,
		handleStopped,
		maybeGenerateTitle,
		projectId,
		trpc,
		queryClient,
		lastMessage,
	]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Full-bleed scroller: the scrollbar lands at the viewport edge while
			    the content below stays in a max-w-3xl reading column. */}
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
			>
				<div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-6">
					{messages.map((message, index) => (
						<MessageCard
							key={message.id}
							content={message.content}
							role={message.role}
							createdAt={message.createdAt}
							type={message.type}
							isLast={index === messages.length - 1 && !streamingMessage}
							// Retry is offered on every message, yours included — rolling
							// back to an earlier one discards whatever came after it.
							onRetry={() => handleRetry(message.id)}
							canRetry={!isRollbackBusy}
							attachments={message.attachments}
							isEditing={editingMessageId === message.id}
							isEditPending={editAndResend.isPending}
							onStartEdit={
								isRollbackBusy
									? undefined
									: () => setEditingMessageId(message.id)
							}
							onCancelEdit={() => setEditingMessageId(null)}
							onSubmitEdit={(value) => handleSubmitEdit(message.id, value)}
						/>
					))}
					{streamingMessage && (
						<MessageCard
							content={streamingMessage.content}
							role="ASSISTANT"
							createdAt={new Date()}
							type={streamingMessage.type}
							isStreaming={streamingMessage.isStreaming}
							statusLabel={
								streamingMessage.status === "compacting"
									? "Compacting conversation…"
									: undefined
							}
						/>
					)}
					{isLastMessageUser && !streamingMessage && !stopped && (
						<MessageLoading />
					)}
				</div>
			</div>

			<div className="relative shrink-0">
				<div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-b from-transparent to-background" />
				{!isAtBottom && (
					<ScrollToBottomButton
						onClick={scrollToBottom}
						className="absolute -top-11 left-1/2 z-10 -translate-x-1/2"
					/>
				)}
				<div className="mx-auto w-full max-w-3xl px-4 pb-3">
					<MessageForm
						projectId={projectId}
						isStreaming={streamingMessage?.isStreaming ?? false}
						onStopRequested={stopAutoStartedStream}
						onChatStreamStopped={handleStopped}
						onChatStreamStart={() => {
							// A new send clears the stop latch, re-arming auto-start.
							setStopped(false);
							setStreamingMessage({
								content: "",
								type: "RESULT",
								isStreaming: true,
							});
						}}
						onChatStreamStatus={(status) =>
							setStreamingMessage((current) => ({
								content: current?.content ?? "",
								type: current?.type ?? "RESULT",
								isStreaming: true,
								status,
							}))
						}
						onChatStreamToken={(token) =>
							setStreamingMessage((current) => ({
								content: `${current?.content ?? ""}${token}`,
								type: current?.type ?? "RESULT",
								isStreaming: true,
							}))
						}
						onChatStreamEnd={() => {
							setStreamingMessage(null);
							maybeGenerateTitle();
						}}
						onChatStreamError={(message) =>
							setStreamingMessage({
								content: message,
								type: "ERROR",
								isStreaming: false,
							})
						}
					/>
				</div>
			</div>
		</div>
	);
};
