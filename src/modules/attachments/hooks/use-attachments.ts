"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_TOTAL_ATTACHMENT_BYTES,
	type AttachmentInput,
} from "../constants";
import { prepareImage, type PreparedImage } from "../lib/prepare-image";

export interface UseAttachments {
	attachments: PreparedImage[];
	isPreparing: boolean;
	/** Downscales, encodes, and adds files, reporting any rejections via toast. */
	addFiles: (files: FileList | File[]) => Promise<void>;
	removeAt: (index: number) => void;
	clear: () => void;
	/** The wire form: preview URLs and file names stripped. */
	toInput: () => AttachmentInput[];
}

/**
 * Manages composer image attachments: preparation, limits, and preview cleanup.
 * @returns {UseAttachments} Attachment state and handlers.
 */
export function useAttachments(): UseAttachments {
	const [attachments, setAttachments] = useState<PreparedImage[]>([]);
	const [isPreparing, setIsPreparing] = useState(false);
	// The ref, not the state, is the authoritative list. Preparation is async, so
	// two quick drops can overlap; reading committed state would let the second
	// batch miss the first. Every mutator writes both, and the ref also gives the
	// unmount cleanup the current previews without re-running on each change.
	const attachmentsRef = useRef<PreparedImage[]>([]);

	/** Commits a new list to both the ref and React state. */
	const commit = useCallback((next: PreparedImage[]) => {
		attachmentsRef.current = next;
		setAttachments(next);
	}, []);

	useEffect(
		() => () => {
			for (const attachment of attachmentsRef.current) {
				URL.revokeObjectURL(attachment.previewUrl);
			}
		},
		[],
	);

	const addFiles = useCallback(async (files: FileList | File[]) => {
		const incoming = Array.from(files);

		if (incoming.length === 0) {
			return;
		}

		setIsPreparing(true);

		try {
			const prepared: PreparedImage[] = [];

			for (const file of incoming) {
				try {
					prepared.push(await prepareImage(file));
				} catch (error) {
					toast.error(
						error instanceof Error ? error.message : "Couldn't read that image.",
					);
				}
			}

			if (prepared.length === 0) {
				return;
			}

			// Decide first, then apply. Running toasts and revokeObjectURL inside a
			// state updater made them side effects of a function React is free to
			// call more than once — which double-revoked previews and duplicated
			// error toasts.
			const current = attachmentsRef.current;
			const room = MAX_ATTACHMENTS_PER_MESSAGE - current.length;
			const accepted: PreparedImage[] = [];
			const rejected: PreparedImage[] = [];
			const oversized: string[] = [];
			let overCount = false;
			let total = current.reduce((sum, item) => sum + item.byteSize, 0);

			for (const item of prepared) {
				if (accepted.length >= room) {
					overCount = true;
					rejected.push(item);
					continue;
				}

				// Mirror the server's total cap here so the user finds out before
				// spending time on an upload that would be rejected.
				if (total + item.byteSize > MAX_TOTAL_ATTACHMENT_BYTES) {
					oversized.push(item.fileName);
					rejected.push(item);
					continue;
				}

				total += item.byteSize;
				accepted.push(item);
			}

			for (const item of rejected) {
				URL.revokeObjectURL(item.previewUrl);
			}

			// One toast per reason, not one per rejected file.
			if (overCount) {
				toast.error(
					`You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} images.`,
				);
			}

			if (oversized.length > 0) {
				toast.error(
					`${oversized.join(", ")} would exceed the total size limit.`,
				);
			}

			if (accepted.length > 0) {
				commit([...current, ...accepted]);
			}
		} finally {
			setIsPreparing(false);
		}
	}, [commit]);

	const removeAt = useCallback(
		(index: number) => {
			const current = attachmentsRef.current;
			const target = current[index];

			if (!target) {
				return;
			}

			URL.revokeObjectURL(target.previewUrl);
			commit(current.filter((_, i) => i !== index));
		},
		[commit],
	);

	const clear = useCallback(() => {
		for (const item of attachmentsRef.current) {
			URL.revokeObjectURL(item.previewUrl);
		}

		commit([]);
	}, [commit]);

	const toInput = useCallback(
		(): AttachmentInput[] =>
			attachments.map(({ mimeType, data, width, height }) => ({
				mimeType,
				data,
				width,
				height,
			})),
		[attachments],
	);

	return { attachments, isPreparing, addFiles, removeAt, clear, toInput };
}
