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
	// Object URLs must be revoked on unmount, and that cleanup needs the *current*
	// list — but it must not re-run on every change, or it would revoke previews
	// that are still on screen. A ref mirrored in its own effect gives us both.
	const attachmentsRef = useRef<PreparedImage[]>([]);

	useEffect(() => {
		attachmentsRef.current = attachments;
	}, [attachments]);

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

			setAttachments((current) => {
				const room = MAX_ATTACHMENTS_PER_MESSAGE - current.length;

				if (room <= 0) {
					toast.error(
						`You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} images.`,
					);
					prepared.forEach((item) => URL.revokeObjectURL(item.previewUrl));
					return current;
				}

				const accepted: PreparedImage[] = [];
				let total = current.reduce((sum, item) => sum + item.byteSize, 0);

				for (const item of prepared) {
					if (accepted.length >= room) {
						toast.error(
							`You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} images.`,
						);
						URL.revokeObjectURL(item.previewUrl);
						continue;
					}

					// Mirror the server's total cap here so the user finds out before
					// spending time on an upload that would be rejected.
					if (total + item.byteSize > MAX_TOTAL_ATTACHMENT_BYTES) {
						toast.error(`${item.fileName} would exceed the total size limit.`);
						URL.revokeObjectURL(item.previewUrl);
						continue;
					}

					total += item.byteSize;
					accepted.push(item);
				}

				return accepted.length > 0 ? [...current, ...accepted] : current;
			});
		} finally {
			setIsPreparing(false);
		}
	}, []);

	const removeAt = useCallback((index: number) => {
		setAttachments((current) => {
			const target = current[index];

			if (target) {
				URL.revokeObjectURL(target.previewUrl);
			}

			return current.filter((_, i) => i !== index);
		});
	}, []);

	const clear = useCallback(() => {
		setAttachments((current) => {
			current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
			return [];
		});
	}, []);

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
