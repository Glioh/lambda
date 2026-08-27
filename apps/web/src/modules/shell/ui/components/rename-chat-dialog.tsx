"use client";

import { useState } from "react";
import type { Project } from "@lambda/api-client/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getProjectQueryKey, listProjectsQueryKey, renameProjectMutationOptions, } from "@lambda/api-client/query";
import { getRequestErrorDetails } from "@/lib/request-error";

const MAX_NAME_LENGTH = 100;

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	chatId: string;
	currentName: string;
}

/**
 * Renames a chat, updating the sidebar and chat header optimistically.
 * @param {Props} props - The dialog props.
 * @returns {JSX.Element} The rendered rename dialog.
 */
export const RenameChatDialog = ({ open, onOpenChange, chatId, currentName }: Props) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				{/* The form lives in a child so its draft state is seeded on mount and
				    thrown away on close — Radix unmounts the content when closed, so
				    reopening always starts from the current name with no reset effect. */}
				<RenameForm chatId={chatId} currentName={currentName} onDone={() => onOpenChange(false)} />
			</DialogContent>
		</Dialog>
	);
};

interface FormProps {
	chatId: string;
	currentName: string;
	onDone: () => void;
}

/**
 * The rename form itself, mounted only while the dialog is open.
 * @param {FormProps} props - The form props.
 * @returns {JSX.Element} The rendered rename form.
 */
const RenameForm = ({ chatId, currentName, onDone }: FormProps) => {
	const queryClient = useQueryClient();
	const [name, setName] = useState(currentName);
	const rename = useMutation({
		...renameProjectMutationOptions(),
		onSuccess: ({ id, name: newName }) => {
			queryClient.setQueryData<Project>(
				getProjectQueryKey({ path: { projectId: id } }),
				previous => (previous ? { ...previous, name: newName } : previous),
			);

			// Close first, refresh after. The write already succeeded, so gating
			// the dialog on a refetch would leave it hanging open for no reason —
			// and the optimistic setQueryData above already shows the new name.
			onDone();
			void queryClient.invalidateQueries({ queryKey: listProjectsQueryKey() });
		},
		onError: error => toast.error(getRequestErrorDetails(error).message),
	});

	const trimmed = name.trim();
	const canSubmit = trimmed.length > 0 && trimmed !== currentName && !rename.isPending;

	return (
		<form
			onSubmit={event => {
				event.preventDefault();
				if (canSubmit) {
					rename.mutate({ path: { projectId: chatId }, body: { name: trimmed } });
				}
			}}
		>
			<DialogHeader>
				<DialogTitle>Rename chat</DialogTitle>
				<DialogDescription>Give this chat a name you&apos;ll recognize later.</DialogDescription>
			</DialogHeader>
			<div className="py-4">
				<Input
					autoFocus
					value={name}
					maxLength={MAX_NAME_LENGTH}
					onChange={event => setName(event.target.value)}
					placeholder="Chat name"
				/>
			</div>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Cancel
				</Button>
				<Button type="submit" disabled={!canSubmit}>
					Save
				</Button>
			</DialogFooter>
		</form>
	);
};
