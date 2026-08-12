import { differenceInCalendarDays, format } from "date-fns";

export interface ChatListEntry {
	id: string;
	name: string;
	updatedAt: Date;
}

export interface ChatGroup {
	label: string;
	chats: ChatListEntry[];
}

/**
 * Buckets chats into recency groups for the sidebar.
 *
 * Input is expected newest-first (as `projects.getMany` returns it); group order
 * follows first appearance so the result stays newest-first without a second
 * sort. Empty buckets are omitted entirely rather than rendered as empty headings.
 *
 * @param {ChatListEntry[]} chats - Chats ordered newest-first.
 * @param {number} now - Reference timestamp, injectable so this is testable.
 * @returns {ChatGroup[]} Non-empty groups in newest-first order.
 */
export function groupChatsByRecency(
	chats: ChatListEntry[],
	now: number,
): ChatGroup[] {
	const groups: ChatGroup[] = [];
	const byLabel = new Map<string, ChatGroup>();

	for (const chat of chats) {
		const label = recencyLabel(chat.updatedAt, now);
		let group = byLabel.get(label);

		if (!group) {
			group = { label, chats: [] };
			byLabel.set(label, group);
			groups.push(group);
		}

		group.chats.push(chat);
	}

	return groups;
}

/**
 * Picks the bucket heading for a single chat.
 * @param {Date} updatedAt - When the chat last saw activity.
 * @param {number} now - Reference timestamp.
 * @returns {string} The group label.
 */
function recencyLabel(updatedAt: Date, now: number): string {
	// Calendar days, not elapsed hours: a chat from 9pm two nights ago belongs in
	// "Previous 7 Days", not in a bucket decided by what time of day it is now.
	//
	// Every bucket is derived from the injected `now`. date-fns `isToday` and
	// `isYesterday` read the system clock instead, so they ignored `now` entirely
	// — which made those two buckets untestable and quietly wrong whenever the
	// caller's reference point wasn't the machine's current date.
	const days = differenceInCalendarDays(now, updatedAt);

	if (days <= 0) {
		return "Today";
	}

	if (days === 1) {
		return "Yesterday";
	}

	if (days <= 7) {
		return "Previous 7 Days";
	}

	if (days <= 30) {
		return "Previous 30 Days";
	}

	return format(updatedAt, "MMMM yyyy");
}
