import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { ClarificationCard } from "./clarification-card";
import { MessageCard } from "./message-card";
import { MessageForm } from "./message-form";
import { Fragment as ReactFragment, useEffect, useRef, useState } from "react";
import type { Fragment, MessageType } from "@prisma/client";
import { MessageLoading } from "./message-loading";
import { toast } from "sonner";

interface Props {
	projectId: string;
	activeFragment: Fragment | null;
	onUserSelectFragment: (fragment: Fragment | null) => void;
	onAutoSelectFragment: (fragment: Fragment | null) => void;
	onUserMessageSendStart: () => void;
}

/**
 * Coordinates the message list, streaming preview, and message composer.
 * @param {Props} props - The container props.
 * @returns {JSX.Element} The rendered messages container.
 */
export const MessagesContainer = ({
	projectId,
	activeFragment,
	onUserSelectFragment,
	onAutoSelectFragment,
	onUserMessageSendStart,
}: Props) => {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const bottomRef = useRef<HTMLDivElement>(null);
	const lastAssistantMessageIdRef = useRef<string | null>(null);
	const hasInitializedStreamRef = useRef<boolean>(false);
	const [streamingMessage, setStreamingMessage] = useState<{
		content: string;
		type: MessageType;
		isStreaming: boolean;
	} | null>(null);

	const { data: messages } = useSuspenseQuery(
		trpc.messages.getMany.queryOptions(
			{
				projectId: projectId,
			},
			{
				refetchInterval: 1500, // Poll every 1.5 seconds for new messages
			},
		),
	);

	useEffect(() => {
		const lastAssistantMessage = messages.findLast(
			(message) => message.role === "ASSISTANT",
		);

		if (
			lastAssistantMessage?.fragment &&
			lastAssistantMessage.id !== lastAssistantMessageIdRef.current
		) {
			onAutoSelectFragment(lastAssistantMessage.fragment);
			lastAssistantMessageIdRef.current = lastAssistantMessage.id;
		}
	}, [messages, onAutoSelectFragment]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length, streamingMessage?.content]);

	const lastMessage = messages[messages.length - 1];
	const isLastMessageUser = lastMessage?.role === "USER";
	const invalidateMessages = () => {
		void queryClient.invalidateQueries(
			trpc.messages.getMany.queryOptions({ projectId }),
		);
	};

	// Start streaming response if last message is from user and we aren't already streaming a response
	// This occurs when we type a chat prompt from the home page it'll trigger this and start streaming the response immediately when we navigate to the project page
	// MessageForm will not trigger streaming since it checks if the message is already sent before starting the stream, so this is a necessary effect to handle that case
	useEffect(() => {
		if (
			isLastMessageUser &&
			!streamingMessage &&
			!hasInitializedStreamRef.current
		) {
			hasInitializedStreamRef.current = true;

			const streamChatResponse = async (value: string) => {
				setStreamingMessage({
					content: "",
					type: "RESULT",
					isStreaming: true,
				});

				try {
					const response = await fetch("/api/chat", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							value,
							projectId,
						}),
					});

					if (!response.ok || !response.body) {
						throw new Error("Unable to start chat response.");
					}

					const reader = response.body.getReader();
					const decoder = new TextDecoder();
					let buffer = "";

					while (true) {
						const { value: chunk, done } = await reader.read();

						if (done) {
							break;
						}

						buffer += decoder.decode(chunk, { stream: true });
						const events = buffer.split("\n\n");
						buffer = events.pop() ?? "";

						for (const event of events) {
							const lines = event.split("\n");
							const eventName =
								lines
									.find((line) => line.startsWith("event: "))
									?.slice("event: ".length) ?? "message";
							const data = lines
								.find((line) => line.startsWith("data: "))
								?.slice("data: ".length);

							if (!data) {
								continue;
							}

							if (data === "[DONE]") {
								await queryClient.invalidateQueries(
									trpc.messages.getMany.queryOptions({ projectId }),
								);

								setStreamingMessage(null);
								return;
							}

							const parsed = JSON.parse(data) as {
								token?: string;
								error?: string;
							};

							if (eventName === "error") {
								setStreamingMessage({
									content:
										parsed.error ?? "Something went wrong. Please try again.",
									type: "ERROR",
									isStreaming: false,
								});
								continue;
							}

							if (eventName === "status") {
								continue;
							}

							if (parsed.token) {
								setStreamingMessage((current) => ({
									content: `${current?.content ?? ""}${parsed.token}`,
									type: current?.type ?? "RESULT",
									isStreaming: true,
								}));
							}
						}
					}
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
				}
			};

			streamChatResponse(lastMessage.content).catch(() => {
				hasInitializedStreamRef.current = false;
			});
		}
	}, [
		isLastMessageUser,
		streamingMessage,
		projectId,
		trpc,
		queryClient,
		lastMessage,
	]);

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div className="flex-1 min-h-0 overflow-y-auto">
				<div className="pt-2 pr-1">
					{messages.map((message) => {
						const clarificationRuns = message.pendingRuns.filter(
							(pendingRun) => pendingRun.status === "clarification_required",
						);

						return (
							<ReactFragment key={message.id}>
								<MessageCard
									content={message.content}
									role={message.role}
									fragment={message.fragment}
									createdAt={message.createdAt}
									isActiveFragment={
										!!activeFragment &&
										!!message.fragment &&
										activeFragment.id === message.fragment.id
									}
									onFragmentClick={() => onUserSelectFragment(message.fragment)}
									type={message.type}
								/>
								{clarificationRuns.map((pendingRun) => (
									<ClarificationCard
										key={pendingRun.id}
										pendingRun={pendingRun}
										onClarified={invalidateMessages}
										onCancelled={invalidateMessages}
									/>
								))}
							</ReactFragment>
						);
					})}
					{streamingMessage && (
						<MessageCard
							content={streamingMessage.content}
							role="ASSISTANT"
							fragment={null}
							createdAt={new Date()}
							isActiveFragment={false}
							onFragmentClick={() => undefined}
							type={streamingMessage.type}
							isStreaming={streamingMessage.isStreaming}
						/>
					)}
					{isLastMessageUser && !streamingMessage && <MessageLoading />}
					<div ref={bottomRef} />
				</div>
			</div>
			<div className="relative p-3 pt-1">
				<div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background pointer-events-none" />
				<MessageForm
					projectId={projectId}
					onSendStart={onUserMessageSendStart}
					onChatStreamStart={() =>
						setStreamingMessage({
							content: "",
							type: "RESULT",
							isStreaming: true,
						})
					}
					onChatStreamToken={(token) =>
						setStreamingMessage((current) => ({
							content: `${current?.content ?? ""}${token}`,
							type: current?.type ?? "RESULT",
							isStreaming: true,
						}))
					}
					onChatStreamEnd={() => setStreamingMessage(null)}
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
	);
};
