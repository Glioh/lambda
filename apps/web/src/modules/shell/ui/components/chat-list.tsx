"use client";

import { useSyncExternalStore } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, } from "@/components/ui/sidebar";
import { listProjectsQueryOptions } from "@lambda/api-client/query";
import { groupChatsByRecency } from "@/modules/shell/lib/group-chats";
import { ChatListItem } from "./chat-list-item";

const ROLLOVER_CHECK_MS = 60_000;

/**
 * Start of the current local day. Grouping only cares about calendar days, so a
 * day-granular clock is both sufficient and *stable* — returning the same value
 * for every call within a day is what makes it a valid external-store snapshot.
 * @returns {number} Midnight of today, as an epoch timestamp.
 */
const getDayStart = (): number => new Date().setHours(0, 0, 0, 0);

/**
 * Re-checks the day boundary periodically so a tab left open overnight
 * re-buckets "Today" into "Yesterday" on its own.
 * @param {() => void} onChange - React's store-changed callback.
 * @returns {() => void} The unsubscribe function.
 */
const subscribeToDayRollover = (onChange: () => void): (() => void) => {
	const timer = setInterval(onChange, ROLLOVER_CHECK_MS);
	return () => clearInterval(timer);
};

/**
 * The sidebar's past-chat list, bucketed by recency.
 * @returns {JSX.Element} The rendered chat list.
 */
export const ChatList = () => {
	const { data: projectsResponse } = useSuspenseQuery(listProjectsQueryOptions());
	const chats = projectsResponse;

	// The server's day and the viewer's day can differ by timezone; useSyncExternalStore
	// re-renders with the client's value after hydration rather than mismatching.
	const dayStart = useSyncExternalStore(subscribeToDayRollover, getDayStart, getDayStart);

	if (chats.length === 0) {
		return (
			<div className="px-4 py-6 text-xs text-muted-foreground">
				No chats yet. Start one and it&apos;ll show up here.
			</div>
		);
	}

	// API already orders newest-first, which is what grouper expects.
	const groups = groupChatsByRecency(
		chats.map(chat => ({ ...chat, updatedAt: new Date(chat.updatedAt) })),
		dayStart,
	);

	return (
		<>
			{groups.map(group => (
				<SidebarGroup key={group.label}>
					<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{group.chats.map(chat => (
								<ChatListItem key={chat.id} chat={chat} />
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			))}
		</>
	);
};
