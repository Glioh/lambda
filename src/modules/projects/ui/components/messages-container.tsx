import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { MessageCard } from "./message-card";
import { MessageForm } from "./message-form";
import { useEffect, useRef, useState } from "react";
import type { Fragment, MessageType } from "@prisma/client";
import { MessageLoading } from "./message-loading";

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
	const bottomRef = useRef<HTMLDivElement>(null);
	const lastAssistantMessageIdRef = useRef<string | null>(null);
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

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div className="flex-1 min-h-0 overflow-y-auto">
				<div className="pt-2 pr-1">
					{messages.map((message) => (
						<MessageCard
							key={message.id}
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
					))}
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
