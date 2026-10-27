"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, CrownIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserControl } from "@/components/user-control";
import { DeleteChatDialog } from "@/modules/shell/ui/components/delete-chat-dialog";
import { RenameChatDialog } from "@/modules/shell/ui/components/rename-chat-dialog";
import { getProjectQueryOptions } from "@lambda/api-client/query";

interface Props {
	projectId: string;
}

/**
 * The chat's top bar: sidebar toggle, title with rename/delete, and account
 * controls. Replaces the old dropdown-only header now that the sidebar owns
 * navigation.
 * @param {Props} props - The header props.
 * @returns {JSX.Element} The rendered chat header.
 */
export const ChatHeader = ({ projectId }: Props) => {
	const { has, isLoaded } = useAuth();
	const [renameOpen, setRenameOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const { data: projectResponse } = useSuspenseQuery(
		getProjectQueryOptions({ path: { projectId } }),
	);
	const project = projectResponse;

	const hasProAccess = isLoaded ? has?.({ plan: "pro" }) : undefined;

	return (
		<header className="flex min-w-0 shrink-0 items-center gap-1 border-b p-2">
			<SidebarTrigger />
			<Separator orientation="vertical" className="mr-1 !h-4" />

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="min-w-0 shrink focus-visible:ring-0 hover:bg-transparent hover:opacity-75 transition-opacity"
					>
						<span className="title-fade text-sm font-medium" title={project.name}>
							{project.name}
						</span>
						<ChevronDown className="shrink-0" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="bottom" align="start" className="w-44">
					<DropdownMenuItem
						disabled={!project.titleFinalized}
						onSelect={event => {
							event.preventDefault();
							setRenameOpen(true);
						}}
					>
						<PencilIcon />
						Rename
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onSelect={event => {
							event.preventDefault();
							setDeleteOpen(true);
						}}
					>
						<Trash2Icon />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="ml-auto flex shrink-0 items-center gap-x-2">
				{isLoaded && !hasProAccess && (
					<Button asChild size="sm" variant="tertiary">
						<Link href="/pricing">
							<CrownIcon /> Upgrade
						</Link>
					</Button>
				)}
				<UserControl />
			</div>

			<RenameChatDialog
				open={renameOpen}
				onOpenChange={setRenameOpen}
				chatId={projectId}
				currentName={project.name}
			/>
			<DeleteChatDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				chatId={projectId}
				chatName={project.name}
				isActive
			/>
		</header>
	);
};
