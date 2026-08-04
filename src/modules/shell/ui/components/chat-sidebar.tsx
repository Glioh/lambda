"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorBoundary } from "react-error-boundary";
import { PlusIcon } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@/components/ui/sidebar";
import { ChatList } from "./chat-list";
import { ChatListSkeleton } from "./chat-list-skeleton";
import { SidebarUserMenu } from "./sidebar-user-menu";

/**
 * The persistent left sidebar: new chat, past chats, and the account menu.
 * Mounted by the app layout so it survives navigation between chats.
 * @returns {JSX.Element} The rendered sidebar.
 */
export const ChatSidebar = () => {
	const router = useRouter();
	const { isMobile, setOpenMobile } = useSidebar();

	const startNewChat = () => {
		if (isMobile) {
			setOpenMobile(false);
		}
		// `/` is the new-chat composer for signed-in users.
		router.push("/");
	};

	return (
		<Sidebar collapsible="offcanvas">
			<SidebarHeader className="gap-2">
				{/* No toggle here: the one in the chat header stays reachable when the
				    sidebar is collapsed offcanvas, so a second one is just clutter. */}
				<div className="flex items-center px-1 py-1">
					<Link href="/" className="flex items-center gap-2">
						<Image src="/logo.svg" alt="" width={20} height={20} />
						<span className="text-sm font-semibold">Lambda</span>
					</Link>
				</div>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton onClick={startNewChat} tooltip="New chat">
							<PlusIcon />
							<span>New chat</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<ErrorBoundary
					fallback={
						<div className="px-4 py-6 text-xs text-muted-foreground">
							Couldn&apos;t load your chats.
						</div>
					}
				>
					<Suspense fallback={<ChatListSkeleton />}>
						<ChatList />
					</Suspense>
				</ErrorBoundary>
			</SidebarContent>

			<SidebarFooter>
				<SidebarUserMenu />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
};
