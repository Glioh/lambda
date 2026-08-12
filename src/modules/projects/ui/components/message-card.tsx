import { Card } from "@/components/ui/card";
import { MessageRole, MessageType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChevronRightIcon, SparklesIcon } from "lucide-react";
import Image from "next/image";
import { Markdown } from "@/components/markdown";
import { MessageActions } from "./message-actions";
import { MessageEditForm } from "./message-edit-form";
import {
	MessageAttachments,
	type MessageAttachment,
} from "@/modules/attachments/ui/components/message-attachments";

interface UserMessageProps {
	content: string;
	attachments?: MessageAttachment[];
	isEditing?: boolean;
	isEditPending?: boolean;
	onStartEdit?: () => void;
	onCancelEdit?: () => void;
	onSubmitEdit?: (value: string) => void;
	onRetry?: () => void;
	canRetry?: boolean;
}

/**
 * Renders a user-authored message bubble, with any attached images above it.
 * @param {UserMessageProps} props - The user message props.
 * @returns {JSX.Element} The rendered user message bubble.
 */
const UserMessage = ({
	content,
	attachments,
	isEditing,
	isEditPending,
	onStartEdit,
	onCancelEdit,
	onSubmitEdit,
	onRetry,
	canRetry,
}: UserMessageProps) => {
	const hasAttachments = !!attachments && attachments.length > 0;

	return (
		<div className="group flex flex-col items-end pb-4 pr-2 pl-10">
			{hasAttachments && <MessageAttachments attachments={attachments} />}

			{isEditing && onCancelEdit && onSubmitEdit ? (
				<MessageEditForm
					initialValue={content}
					// Images alone are a complete message, so text may be cleared.
					allowEmpty={hasAttachments}
					isPending={isEditPending}
					onCancel={onCancelEdit}
					onSubmit={onSubmitEdit}
				/>
			) : (
				<>
					{/* An image on its own is a valid message, so skip the empty bubble. */}
					{content.trim() && (
						<Card className="rounded-lg bg-muted p-3 shadow-none border-none max-w-[80%] break-words whitespace-pre-wrap">
							{content}
						</Card>
					)}
					<MessageActions
						// An attachment-only message has nothing to copy, so the
						// action is hidden rather than silently copying "".
						content={content.trim() ? content : undefined}
						align="right"
						onEdit={onStartEdit}
						// Re-runs this prompt as-is, discarding the answers after it.
						onRetry={onRetry}
						canRetry={canRetry}
					/>
				</>
			)}
		</div>
	);
};

interface SummaryDividerProps {
	content: string;
}

/**
 * Renders a compaction checkpoint as an expandable divider in the thread.
 * @param {SummaryDividerProps} props - The summary divider props.
 * @returns {JSX.Element} The rendered compaction divider.
 */
const SummaryDivider = ({ content }: SummaryDividerProps) => {
	return (
		<div className="px-2 pb-4">
			<details className="group/summary rounded-lg border border-dashed bg-muted/30 px-3 py-2">
				<summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground">
					<SparklesIcon className="size-3.5 shrink-0" />
					<span className="font-medium">Conversation compacted</span>
					<span className="hidden sm:inline opacity-70">
						— earlier messages summarized
					</span>
					<ChevronRightIcon className="ml-auto size-3.5 shrink-0 transition-transform group-open/summary:rotate-90" />
				</summary>
				<p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
					{content}
				</p>
			</details>
		</div>
	);
};

interface AssistantMessageProps {
	content: string;
	createdAt: Date;
	type: MessageType;
	isStreaming?: boolean;
	statusLabel?: string;
	isLast?: boolean;
	onRetry?: () => void;
	canRetry?: boolean;
}

/**
 * Renders an assistant message.
 * @param {AssistantMessageProps} props - The assistant message props.
 * @returns {JSX.Element} The rendered assistant message block.
 */
const AssistantMessage = ({
	content,
	createdAt,
	type,
	isStreaming,
	statusLabel,
	isLast,
	onRetry,
	canRetry,
}: AssistantMessageProps) => {
	return (
		<div
			className={cn(
				"flex flex-col group px-2 pb-4",
				type === "ERROR" && "text-red-700 dark:text-red-500",
			)}
		>
			<div className="flex items-center gap-2 pl-2 mb-2">
				<Image
					src="/logo.svg"
					alt="Lambda Logo"
					width={18}
					height={18}
					className="shrink-0"
				/>
				<span className="text-sm font-medium">Lambda</span>
				<span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
					{format(createdAt, "HH:mm 'on' MMM dd, yyyy")}
				</span>
			</div>
			<div className="pl-8.5 flex flex-col gap-y-4">
				<div>
					{type === "ERROR" ? (
						<span className="whitespace-pre-wrap">{content}</span>
					) : (
						<Markdown content={content} />
					)}
					{isStreaming && !content && statusLabel && (
						<span className="italic text-muted-foreground">{statusLabel}</span>
					)}
					{isStreaming && (
						<span className="inline-flex pl-1 text-muted-foreground">
							<span className="animate-pulse">.</span>
							<span className="animate-pulse delay-150">.</span>
							<span className="animate-pulse delay-300">.</span>
						</span>
					)}
				</div>
				{/* Actions would be meaningless mid-stream: there's nothing final to
				    copy and retrying would race the response being written. Retry is
				    offered on every answer, including errors — those are otherwise
				    dead ends you can only escape by retyping the prompt. */}
				{!isStreaming && content && (
					<MessageActions
						content={content}
						alwaysVisible={isLast}
						onRetry={onRetry}
						canRetry={canRetry}
					/>
				)}
			</div>
		</div>
	);
};

interface MessageCardProps {
	content: string;
	role: MessageRole;
	createdAt: Date;
	type: MessageType;
	isStreaming?: boolean;
	statusLabel?: string;
	/** The newest message in the thread: pins its action row open. */
	isLast?: boolean;
	/** Rolls the thread back to this answer and re-runs the prompt behind it. */
	onRetry?: () => void;
	canRetry?: boolean;
	attachments?: MessageAttachment[];
	isEditing?: boolean;
	isEditPending?: boolean;
	onStartEdit?: () => void;
	onCancelEdit?: () => void;
	onSubmitEdit?: (value: string) => void;
}

/**
 * Renders either the user message bubble or assistant message layout.
 * @param {MessageCardProps} props - The message card props.
 * @returns {JSX.Element} The rendered message card.
 */
export const MessageCard = ({
	content,
	role,
	createdAt,
	type,
	isStreaming,
	statusLabel,
	isLast,
	onRetry,
	canRetry,
	attachments,
	isEditing,
	isEditPending,
	onStartEdit,
	onCancelEdit,
	onSubmitEdit,
}: MessageCardProps) => {
	if (type === "SUMMARY") {
		return <SummaryDivider content={content} />;
	}

	if (role === "ASSISTANT") {
		return (
			<AssistantMessage
				content={content}
				createdAt={createdAt}
				type={type}
				isStreaming={isStreaming}
				statusLabel={statusLabel}
				isLast={isLast}
				onRetry={onRetry}
				canRetry={canRetry}
			/>
		);
	}

	return (
		<UserMessage
			content={content}
			attachments={attachments}
			isEditing={isEditing}
			isEditPending={isEditPending}
			onStartEdit={onStartEdit}
			onCancelEdit={onCancelEdit}
			onSubmitEdit={onSubmitEdit}
			onRetry={onRetry}
			canRetry={canRetry}
		/>
	);
};
