import Image from "next/image";

/** Persisted image metadata needed to render message attachment. */
export interface MessageAttachment {
	id: string;
	mimeType: string;
	width: number;
	height: number;
}

interface Props {
	attachments: MessageAttachment[];
}

/** Rendered cap. The aspect ratio is preserved; the full image opens on click. */
const MAX_THUMB_EDGE = 240;

/**
 * Fits an image inside a square bound while preserving its aspect ratio.
 * @param {number} width - Intrinsic width.
 * @param {number} height - Intrinsic height.
 * @returns {{ width: number; height: number }} The displayed dimensions.
 */
const fitWithin = (width: number, height: number) => {
	const scale = Math.min(1, MAX_THUMB_EDGE / Math.max(width, height));

	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
};

/**
 * Images attached to a persisted message.
 *
 * Sources are the /api/attachments route rather than inline data URLs, so the
 * bytes stay out of the message list payload and get browser-cached. `unoptimized`
 * because these are already downscaled and re-encoded at upload time.
 *
 * @param {Props} props - The attachment list props.
 * @returns {JSX.Element | null} The rendered images, or null when there are none.
 */
export const MessageAttachments = ({ attachments }: Props) => {
	if (attachments.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap justify-end gap-2 pb-2">
			{attachments.map((attachment) => {
				const size = fitWithin(attachment.width, attachment.height);

				return (
					<a
						key={attachment.id}
						href={`/api/attachments/${attachment.id}`}
						target="_blank"
						rel="noreferrer"
						title="Open full size"
						className="block overflow-hidden rounded-lg border transition-opacity hover:opacity-90"
					>
						<Image
							src={`/api/attachments/${attachment.id}`}
							alt="Attached image"
							width={size.width}
							height={size.height}
							unoptimized
							// Explicit dimensions rather than `w-auto`: the stored file is
							// full size, so letting the intrinsic width win would render a
							// thumbnail at the width of the whole column.
							style={{ width: size.width, height: size.height }}
							className="max-w-full object-contain"
						/>
					</a>
				);
			})}
		</div>
	);
};
