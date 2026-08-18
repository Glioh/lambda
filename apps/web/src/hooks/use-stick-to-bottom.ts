"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** How close to the bottom still counts as "following along". */
const NEAR_BOTTOM_PX = 80;

/** Controls and reports follow-to-bottom behavior for a scroll container. */
export interface StickToBottom<T extends HTMLElement> {
	/** Attach to the scroll container. */
	scrollRef: React.RefObject<T | null>;
	/** Attach to the container's `onScroll`. */
	handleScroll: () => void;
	/** False once the user has scrolled away from the bottom. */
	isAtBottom: boolean;
	/** Smoothly returns to the bottom and re-enables following. */
	scrollToBottom: () => void;
	/** Jumps to the bottom without animation and re-enables following. */
	jumpToBottom: () => void;
}

/**
 * Keeps a scroll container pinned to the bottom as content grows, but stops
 * following the moment the user scrolls up to read.
 *
 * Two deliberate choices:
 * - "Following" lives in a ref, not state, because the layout effect has to read
 *   the current value synchronously before React would flush a state update.
 * - Scrolling is an instant `scrollTop` assignment rather than a smooth
 *   `scrollIntoView`. Smooth-scrolling once per streamed token queues animations
 *   faster than they resolve, which reads as the page fighting the user.
 *
 * @param {unknown[]} deps - Values that indicate content grew (message count, streamed text).
 * @returns {StickToBottom} Refs and handlers for the scroll container.
 */
export function useStickToBottom<T extends HTMLElement>(deps: unknown[]): StickToBottom<T> {
	const scrollRef = useRef<T>(null);
	const isFollowingRef = useRef(true);
	const [isAtBottom, setIsAtBottom] = useState(true);

	const handleScroll = useCallback(() => {
		const element = scrollRef.current;

		if (!element) {
			return;
		}

		const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
		const atBottom = distanceFromBottom < NEAR_BOTTOM_PX;

		isFollowingRef.current = atBottom;
		setIsAtBottom(atBottom);
	}, []);

	useLayoutEffect(() => {
		if (!isFollowingRef.current) {
			return;
		}

		const element = scrollRef.current;

		if (element) {
			// This assignment does fire onScroll, but that handler computes
			// atBottom === true, so the state stays consistent — nothing to suppress.
			element.scrollTop = element.scrollHeight;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	const scrollToBottom = useCallback(() => {
		isFollowingRef.current = true;
		setIsAtBottom(true);
		const element = scrollRef.current;
		element?.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
	}, []);

	const jumpToBottom = useCallback(() => {
		isFollowingRef.current = true;
		setIsAtBottom(true);
		const element = scrollRef.current;

		if (element) {
			element.scrollTop = element.scrollHeight;
		}
	}, []);

	return { scrollRef, handleScroll, isAtBottom, scrollToBottom, jumpToBottom };
}
