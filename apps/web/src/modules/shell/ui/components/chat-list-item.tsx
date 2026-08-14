"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import type { ChatListEntry } from "@/modules/shell/lib/group-chats";
import { DeleteChatDialog } from "./delete-chat-dialog";
import { RenameChatDialog } from "./rename-chat-dialog";

interface Props {
	chat: ChatListEntry;
}

/**
 * A single chat row with its rename/delete overflow menu.
 * @param {Props} props - The chat row props.
 * @returns {JSX.Element} The rendered sidebar chat row.
 */
export const ChatListItem = ({ chat }: Props) => {
	const pathname = usePathname();
	const { isMobile, setOpenMobile } = useSidebar();
	const [renameOpen, setRenameOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const isActive = pathname === `/projects/${chat.id}`;

	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={isActive} tooltip={chat.name}>
				<Link
					href={`/projects/${chat.id}`}
					// On mobile the sidebar is an overlay sheet; leaving it open would
					// cover the chat the user just picked.
					onClick={() => isMobile && setOpenMobile(false)}
				>
					<span className="truncate">{chat.name}</span>
				</Link>
			</SidebarMenuButton>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<SidebarMenuAction showOnHover aria-label={`Options for ${chat.name}`}>
						<MoreHorizontalIcon />
					</SidebarMenuAction>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="right" align="start" className="w-44">
					<DropdownMenuItem
						// preventDefault so the menu's close animation doesn't race the
						// dialog mount — without it the dialog opens and immediately
						// loses focus to the unmounting menu.
						onSelect={(event) => {
							event.preventDefault();
							setRenameOpen(true);
						}}
					>
						<PencilIcon />
						Rename
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onSelect={(event) => {
							event.preventDefault();
							setDeleteOpen(true);
						}}
					>
						<Trash2Icon />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<RenameChatDialog
				open={renameOpen}
				onOpenChange={setRenameOpen}
				chatId={chat.id}
				currentName={chat.name}
			/>
			<DeleteChatDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				chatId={chat.id}
				chatName={chat.name}
				isActive={isActive}
			/>
		</SidebarMenuItem>
	);
};
