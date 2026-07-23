import { Card } from "@/components/ui/card";
import type { Fragment } from "@prisma/client";
import { MessageRole, MessageType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChevronRightIcon, Code2Icon, SparklesIcon } from "lucide-react";
import Image from "next/image";
import { Markdown } from "@/components/markdown";

interface UserMessageProps {
	content: string;
}

/**
 * Renders a user-authored message bubble.
 * @param {UserMessageProps} props - The user message props.
 * @returns {JSX.Element} The rendered user message bubble.
 */
const UserMessage = ({ content }: UserMessageProps) => {
	return (
		<div className="flex justify-end pb-4 pr-2 pl-10">
			<Card className="rounded-lg bg-muted p-3 shadow-none border-none max-w-[80%] break-words">
				{content}
			</Card>
		</div>
	);
};

interface FragmentCardProps {
	fragment: Fragment;
	isActiveFragment: boolean;
	onFragmentClick: (fragment: Fragment) => void;
}

/**
 * Renders a clickable fragment preview card.
 * @param {FragmentCardProps} props - The fragment card props.
 * @returns {JSX.Element} The rendered fragment card.
 */
const FragmentCard = ({
	fragment,
	isActiveFragment,
	onFragmentClick,
}: FragmentCardProps) => {
	return (
		<button
			className={cn(
				"flex items-start text-start gap-2 border rounded-lg bg-muted w-fit p-3 hover:bg-secondary",
				"transition-colors",
				isActiveFragment &&
					"bg-primary text-primary-foreground border-primary hover:bg-primary",
			)}
			onClick={() => onFragmentClick(fragment)}
		>
			<Code2Icon className="size-4 mt-0.5" />
			<div className="flex flex-col flex-1">
				<span className="text-sm font-medium line-clamp-1">
					{fragment.title}
				</span>
				<span className="text-sm">Preview</span>
			</div>
			<div className="flex items-center justify-center mt-0.5">
				<ChevronRightIcon className="size-4" />
			</div>
		</button>
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
	fragment: Fragment | null;
	createdAt: Date;
	isActiveFragment: boolean;
	onFragmentClick: (fragment: Fragment) => void;
	type: MessageType;
	isStreaming?: boolean;
	statusLabel?: string;
}

/**
 * Renders an assistant message, including the optional fragment preview.
 * @param {AssistantMessageProps} props - The assistant message props.
 * @returns {JSX.Element} The rendered assistant message block.
 */
const AssistantMessage = ({
	content,
	fragment,
	createdAt,
	isActiveFragment,
	onFragmentClick,
	type,
	isStreaming,
	statusLabel,
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
				{fragment && type === "RESULT" && (
					<FragmentCard
						fragment={fragment}
						isActiveFragment={isActiveFragment}
						onFragmentClick={onFragmentClick}
					/>
				)}
			</div>
		</div>
	);
};

interface MessageCardProps {
	content: string;
	role: MessageRole;
	fragment: Fragment | null;
	createdAt: Date;
	isActiveFragment: boolean;
	onFragmentClick: (fragment: Fragment) => void;
	type: MessageType;
	isStreaming?: boolean;
	statusLabel?: string;
}

/**
 * Renders either the user message bubble or assistant message layout.
 * @param {MessageCardProps} props - The message card props.
 * @returns {JSX.Element} The rendered message card.
 */
export const MessageCard = ({
	content,
	role,
	fragment,
	createdAt,
	isActiveFragment,
	onFragmentClick,
	type,
	isStreaming,
	statusLabel,
}: MessageCardProps) => {
	if (type === "SUMMARY") {
		return <SummaryDivider content={content} />;
	}

	if (role === "ASSISTANT") {
		return (
			<AssistantMessage
				content={content}
				fragment={fragment}
				createdAt={createdAt}
				isActiveFragment={isActiveFragment}
				onFragmentClick={onFragmentClick}
				type={type}
				isStreaming={isStreaming}
				statusLabel={statusLabel}
			/>
		);
	}

	return <UserMessage content={content} />;
};
