"use client";

import { useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";

interface Props {
	initialValue: string;
	/** True when images carry the message, so empty text is still valid. */
	allowEmpty?: boolean;
	isPending?: boolean;
	onCancel: () => void;
	onSubmit: (value: string) => void;
}

/**
 * Inline editor that replaces a user message bubble while it's being rewritten.
 *
 * Saving rolls the thread back to this turn and re-runs it, so the button says
 * what actually happens rather than "Save".
 *
 * @param {Props} props - The editor props.
 * @returns {JSX.Element} The rendered inline editor.
 */
export const MessageEditForm = ({
	initialValue,
	allowEmpty,
	isPending,
	onCancel,
	onSubmit,
}: Props) => {
	const [value, setValue] = useState(initialValue);

	const trimmed = value.trim();
	const canSubmit =
		!isPending &&
		(trimmed.length > 0 || !!allowEmpty) &&
		trimmed !== initialValue.trim();

	const submit = () => {
		if (canSubmit) {
			onSubmit(trimmed);
		}
	};

	return (
		<div className="w-full max-w-[80%] rounded-lg border bg-sidebar p-3">
			<TextareaAutosize
				autoFocus
				aria-label="Edit message"
				value={value}
				disabled={isPending}
				onChange={(event) => setValue(event.target.value)}
				minRows={2}
				maxRows={12}
				className="w-full resize-none border-none bg-transparent outline-none"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
						return;
					}

					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						submit();
					}
				}}
			/>
			<div className="flex items-center justify-end gap-2 pt-2">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={onCancel}
					disabled={isPending}
				>
					Cancel
				</Button>
				<Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
					Send
				</Button>
			</div>
		</div>
	);
};
