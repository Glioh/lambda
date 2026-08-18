"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ChatSidebar } from "./chat-sidebar";

interface Props {
	/** Read from the `sidebar_state` cookie on the server, so there's no flash. */
	defaultOpen: boolean;
	children: React.ReactNode;
}

/**
 * The signed-in application shell: persistent sidebar beside the active view.
 *
 * Both halves are `h-svh overflow-hidden` so the page itself never scrolls —
 * the message list becomes the only scroll container, which is what puts its
 * scrollbar at the viewport edge. `svh` rather than `vh` because mobile browsers
 * overstate `100vh` by the height of the collapsing URL bar.
 *
 * @param {Props} props - The shell props.
 * @returns {JSX.Element} The rendered app shell.
 */
export const AppShell = ({ defaultOpen, children }: Props) => {
	const router = useRouter();

	// Cmd/Ctrl+Shift+O starts a new chat, matching Claude. (Cmd+B for the
	// sidebar is already handled inside SidebarProvider.)
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "o" && event.shiftKey && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				router.push("/");
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [router]);

	return (
		<SidebarProvider defaultOpen={defaultOpen} className="h-svh overflow-hidden">
			<ChatSidebar />
			<SidebarInset className="flex h-svh min-h-0 flex-col overflow-hidden">
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
};
