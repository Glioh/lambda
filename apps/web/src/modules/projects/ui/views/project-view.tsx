"use client";

import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { MessagesContainer } from "../components/messages-container";
import { ChatHeader } from "../components/chat-header";

interface Props {
	projectId: string;
}

/**
 * A single chat: header above a full-bleed message list.
 *
 * `h-full`, not `h-screen` — the height comes from the app shell's `SidebarInset`,
 * and the message list owns the only scroll container so its scrollbar sits at
 * the viewport edge rather than inside the reading column.
 *
 * @param {Props} props - The view props.
 * @returns {JSX.Element} The rendered chat view.
 */
export const ProjectView = ({ projectId }: Props) => {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<ErrorBoundary
				fallback={
					<div className="shrink-0 border-b p-3 text-sm text-muted-foreground">
						Error loading chat
					</div>
				}
			>
				<Suspense
					fallback={
						<div className="shrink-0 border-b p-3 text-sm text-muted-foreground">
							Loading chat…
						</div>
					}
				>
					<ChatHeader projectId={projectId} />
				</Suspense>
			</ErrorBoundary>

			<ErrorBoundary
				fallback={<p className="p-4">Error loading messages</p>}
			>
				<Suspense fallback={<p className="p-4">Loading messages...</p>}>
					{/* Keyed by chat so switching chats remounts: streaming state, the
					    stop/stopped flags, and the scroll position all reset on their
					    own rather than needing a per-project reset effect. */}
					<MessagesContainer key={projectId} projectId={projectId} />
				</Suspense>
			</ErrorBoundary>
		</div>
	);
};
