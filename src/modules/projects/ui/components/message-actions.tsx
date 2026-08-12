"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** How long the copy button shows its confirmation state. */
const COPIED_FEEDBACK_MS = 1500;

interface Props {
	/** Omit when there's nothing to copy — the copy action is then hidden. */
	content?: string;
	/** Retry rolls the thread back to this answer and re-runs the prompt. */
	onRetry?: () => void;
	canRetry?: boolean;
	/** Editing is offered on user turns; retry on assistant turns. */
	onEdit?: () => void;
	/** Keeps the row visible instead of hover-only, as Claude does for the last turn. */
	alwaysVisible?: boolean;
	/** Aligns the row to the right, for user message bubbles. */
	align?: "left" | "right";
}

/**
 * Copies text, falling back to a hidden textarea when the async Clipboard API
 * is unavailable (it requires a secure context, so plain-HTTP dev hosts lack it).
 * @param {string} text - The text to place on the clipboard.
 * @returns {Promise<boolean>} Whether the copy succeeded.
 */
async function copyText(text: string): Promise<boolean> {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Fall through to the legacy path below.
		}
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.select();

	try {
		return document.execCommand("copy");
	} catch {
		return false;
	} finally {
		document.body.removeChild(textarea);
	}
}

/**
 * Hover actions under an assistant message: copy, and regenerate on the last turn.
 * @param {Props} props - The action row props.
 * @returns {JSX.Element} The rendered action row.
 */
export const MessageActions = ({
	content,
	onRetry,
	canRetry,
	onEdit,
	alwaysVisible,
	align = "left",
}: Props) => {
	const [copied, setCopied] = useState(false);
	const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (resetTimerRef.current) {
				clearTimeout(resetTimerRef.current);
			}
		},
		[],
	);

	const handleCopy = useCallback(async () => {
		if (!content) {
			return;
		}

		const ok = await copyText(content);

		if (!ok) {
			toast.error("Couldn't copy to clipboard.");
			return;
		}

		setCopied(true);

		if (resetTimerRef.current) {
			clearTimeout(resetTimerRef.current);
		}

		resetTimerRef.current = setTimeout(
			() => setCopied(false),
			COPIED_FEEDBACK_MS,
		);
	}, [content]);

	return (
		<div
			className={cn(
				"flex items-center gap-1 pt-1 transition-opacity focus-within:opacity-100",
				align === "right" && "justify-end",
				alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
			)}
		>
			{content && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label={copied ? "Copied" : "Copy message"}
							onClick={handleCopy}
							className="size-7 text-muted-foreground hover:text-foreground"
						>
							{copied ? (
								<CheckIcon className="size-3.5" />
							) : (
								<CopyIcon className="size-3.5" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
				</Tooltip>
			)}

			{onEdit && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label="Edit message"
							onClick={onEdit}
							className="size-7 text-muted-foreground hover:text-foreground"
						>
							<PencilIcon className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Edit</TooltipContent>
				</Tooltip>
			)}

			{onRetry && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label="Retry response"
							disabled={!canRetry}
							onClick={onRetry}
							className="size-7 text-muted-foreground hover:text-foreground"
						>
							<RotateCcwIcon className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Retry</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
};
