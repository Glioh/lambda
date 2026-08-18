"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorBoundary } from "react-error-boundary";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
					<Link
						href="/"
						className="flex items-center gap-2"
						// On mobile the sidebar is an overlay; leaving it open would
						// cover the page just navigated to.
						onClick={() => isMobile && setOpenMobile(false)}
					>
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
				{/* The query must be reset alongside the boundary: useSuspenseQuery
				    replays its cached rejection otherwise, so Retry would re-throw
				    immediately and the list would stay broken until a full reload. */}
				<QueryErrorResetBoundary>
					{({ reset }) => (
						<ErrorBoundary
							onReset={reset}
							fallbackRender={({ resetErrorBoundary }) => (
								<div className="flex flex-col items-start gap-2 px-4 py-6">
									<p className="text-xs text-muted-foreground">Couldn&apos;t load your chats.</p>
									<Button size="sm" variant="outline" onClick={resetErrorBoundary}>
										Retry
									</Button>
								</div>
							)}
						>
							<Suspense fallback={<ChatListSkeleton />}>
								<ChatList />
							</Suspense>
						</ErrorBoundary>
					)}
				</QueryErrorResetBoundary>
			</SidebarContent>

			<SidebarFooter>
				<SidebarUserMenu />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
};
