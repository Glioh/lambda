"use client";

import Image from "next/image";
import { XIcon } from "lucide-react";
import type { PreparedImage } from "../../lib/prepare-image";

interface Props {
	attachments: PreparedImage[];
	onRemove: (index: number) => void;
	disabled?: boolean;
}

/**
 * Pending-image thumbnails shown above the composer input.
 * @param {Props} props - The strip props.
 * @returns {JSX.Element | null} The rendered thumbnails, or null when empty.
 */
export const AttachmentStrip = ({ attachments, onRemove, disabled }: Props) => {
	if (attachments.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap gap-2 pt-3">
			{attachments.map((attachment, index) => (
				<div
					key={attachment.previewUrl}
					className="group/thumb relative size-16 overflow-hidden rounded-lg border bg-muted"
				>
					<Image
						src={attachment.previewUrl}
						alt={attachment.fileName}
						fill
						sizes="64px"
						// Local blob URL; Next's optimizer can't and shouldn't touch it.
						unoptimized
						className="object-cover"
					/>
					<button
						type="button"
						disabled={disabled}
						onClick={() => onRemove(index)}
						aria-label={`Remove ${attachment.fileName}`}
						className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover/thumb:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none"
					>
						<XIcon className="size-3" />
					</button>
				</div>
			))}
		</div>
	);
};
