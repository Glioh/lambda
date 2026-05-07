"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon, XIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

interface DraftEditorProps {
	initialValue: string;
	onConfirm: (value: string) => void;
	onCancel: () => void;
	isPending: boolean;
}

export function DraftEditor({
	initialValue,
	onConfirm,
	onCancel,
	isPending,
}: DraftEditorProps) {
	const [value, setValue] = useState(initialValue);
	const isEmpty = value.trim().length === 0;

	return (
		<div
			className={cn(
				"rounded-lg border bg-muted/30 p-2.5",
				"dark:border-zinc-700/60 dark:bg-zinc-900/30",
			)}
		>
			<TextareaAutosize
				value={value}
				onChange={(e) => setValue(e.target.value)}
				disabled={isPending}
				minRows={2}
				maxRows={6}
				className={cn(
					"w-full resize-none rounded-md border bg-background px-3 py-2",
					"text-sm outline-none placeholder:text-muted-foreground",
					"focus:ring-1 focus:ring-ring",
					"disabled:opacity-50",
				)}
				placeholder="Edit your prompt before confirming..."
			/>
			<div className="flex items-center justify-end gap-1.5 mt-2">
				<Button
					variant="ghost"
					size="sm"
					onClick={onCancel}
					disabled={isPending}
					className="h-7 px-2 text-xs"
				>
					<XIcon className="size-3" />
					Cancel
				</Button>
				<Button
					size="sm"
					onClick={() => onConfirm(value)}
					disabled={isPending || isEmpty}
					className="h-7 px-2.5 text-xs"
				>
					{isPending ? (
						<Loader2Icon className="size-3 animate-spin" />
					) : (
						<CheckIcon className="size-3" />
					)}
					Confirm
				</Button>
			</div>
		</div>
	);
}
