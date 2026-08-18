import test from "node:test";
import assert from "node:assert/strict";
import { groupChatsByRecency, type ChatListEntry } from "@/modules/shell/lib/group-chats";

// Fixed reference point so bucket boundaries are deterministic:
// Sunday 2026-08-02, 14:00 local time.
const NOW = new Date(2026, 7, 2, 14, 0, 0).getTime();

/**
 * Builds a chat entry a given number of days (and optional hours) before NOW.
 */
const chatAt = (id: string, daysAgo: number, hour = 10): ChatListEntry => ({
	id,
	name: `chat-${id}`,
	updatedAt: new Date(2026, 7, 2 - daysAgo, hour, 0, 0),
});

test("groupChatsByRecency returns no groups for an empty list", () => {
	assert.deepEqual(groupChatsByRecency([], NOW), []);
});

test("groupChatsByRecency buckets by calendar recency", () => {
	const groups = groupChatsByRecency(
		[chatAt("a", 0), chatAt("b", 1), chatAt("c", 4), chatAt("d", 20), chatAt("e", 70)],
		NOW,
	);

	assert.deepEqual(
		groups.map(group => group.label),
		["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "May 2026"],
	);
	assert.deepEqual(
		groups.map(group => group.chats.map(chat => chat.id)),
		[["a"], ["b"], ["c"], ["d"], ["e"]],
	);
});

test("groupChatsByRecency keeps groups in newest-first input order", () => {
	const groups = groupChatsByRecency(
		[chatAt("a", 0), chatAt("b", 0), chatAt("c", 3), chatAt("d", 5)],
		NOW,
	);

	assert.deepEqual(
		groups.map(group => group.label),
		["Today", "Previous 7 Days"],
	);
	// Membership order within a group mirrors the input, which is already sorted.
	assert.deepEqual(
		groups[0].chats.map(chat => chat.id),
		["a", "b"],
	);
	assert.deepEqual(
		groups[1].chats.map(chat => chat.id),
		["c", "d"],
	);
});

test("groupChatsByRecency omits empty buckets entirely", () => {
	// Nothing from today or yesterday: those headings must not be rendered.
	const groups = groupChatsByRecency([chatAt("a", 3), chatAt("b", 25)], NOW);

	assert.deepEqual(
		groups.map(group => group.label),
		["Previous 7 Days", "Previous 30 Days"],
	);
});

test("groupChatsByRecency uses calendar days, not elapsed hours", () => {
	// 23:30 "yesterday" is ~14.5 hours before NOW, but it is still Yesterday —
	// an elapsed-hours check would wrongly file it under Today.
	const groups = groupChatsByRecency([chatAt("a", 1, 23)], NOW);

	assert.deepEqual(
		groups.map(group => group.label),
		["Yesterday"],
	);
});

test("groupChatsByRecency puts the 7-day boundary in Previous 7 Days", () => {
	const groups = groupChatsByRecency([chatAt("a", 7), chatAt("b", 8)], NOW);

	assert.deepEqual(
		groups.map(group => group.label),
		["Previous 7 Days", "Previous 30 Days"],
	);
});
