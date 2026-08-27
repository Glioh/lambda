"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, } from "@/components/ui/alert-dialog";
import { deleteProjectMutationOptions, getProjectQueryKey, listProjectsQueryKey, } from "@lambda/api-client/query";
import { listMessagesQueryKey } from "@lambda/api-client/query";
import { getRequestErrorDetails } from "@/lib/request-error";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	chatId: string;
	chatName: string;
	/** True when this chat is the one currently open, which forces a redirect. */
	isActive: boolean;
}

/**
 * Confirms and performs chat deletion, redirecting away if the open chat is the
 * one being deleted.
 * @param {Props} props - The dialog props.
 * @returns {JSX.Element} The rendered delete confirmation.
 */
export const DeleteChatDialog = ({ open, onOpenChange, chatId, chatName, isActive }: Props) => {
	const queryClient = useQueryClient();
	const router = useRouter();

	const remove = useMutation({
		...deleteProjectMutationOptions(),
		onSuccess: ({ id }) => {
			// Drop the chat's cache outright — nothing can render it now, and
			// leaving it would resurrect the chat in the list on a refocus refetch.
			queryClient.removeQueries({
				queryKey: listMessagesQueryKey({ path: { projectId: id } }),
			});
			queryClient.removeQueries({
				queryKey: getProjectQueryKey({ path: { projectId: id } }),
			});

			if (isActive) {
				router.push("/");
			}

			// Same ordering as rename: the delete already succeeded, so close
			// immediately rather than waiting on the list refetch.
			onOpenChange(false);
			void queryClient.invalidateQueries({ queryKey: listProjectsQueryKey() });
		},
		onError: error => toast.error(getRequestErrorDetails(error).message),
	});

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete chat?</AlertDialogTitle>
					<AlertDialogDescription>
						<span className="font-medium text-foreground">{chatName}</span> and all of its messages
						will be permanently deleted. This can&apos;t be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={remove.isPending}
						onClick={event => {
							// Keep the dialog open until the mutation settles, so a failure
							// surfaces against the thing it failed on.
							event.preventDefault();
							remove.mutate({ path: { projectId: chatId } });
						}}
						className="bg-destructive text-white hover:bg-destructive/90"
					>
						{remove.isPending ? "Deleting…" : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
