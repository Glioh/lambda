/**
 * Shared limits for image attachments, imported by both the browser (to
 * downscale before upload) and the server (to re-validate what arrives).
 */

/** Allowlist. Anything outside this set is rejected — see validate.ts for why. */
export const ACCEPTED_IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/** Rejected before decoding, so a huge file can't be turned into a huge string. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/** Per-image ceiling after downscaling. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/**
 * Total decoded bytes per message. 3 MB decoded is ~4 MB once base64-encoded,
 * which keeps the whole tRPC request under the 4.5 MB body limit most hosts
 * enforce — the caps exist to stay under that, not for storage reasons.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/**
 * Longest base64 string that could still decode within MAX_ATTACHMENT_BYTES.
 * Base64 expands by 4/3 plus up to 4 padding characters. Used to reject
 * oversized payloads before allocating a buffer to decode them.
 */
export const MAX_BASE64_CHARS = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4;

/** Longest edge after downscaling; beyond this the model gains no detail. */
export const MAX_IMAGE_EDGE = 1568;

/** Quality for the WebP re-encode. High enough for screenshots and text. */
export const REENCODE_QUALITY = 0.82;

/** The wire shape, after the router's zod schema has narrowed the mime type. */
export interface AttachmentInput {
	mimeType: AcceptedImageType;
	/** Base64 payload with NO `data:<mime>;base64,` prefix. */
	data: string;
	width: number;
	height: number;
}

/**
 * What {@link validateAttachments} actually accepts. Deliberately looser than
 * {@link AttachmentInput}: the runtime allowlist check is the point, so the type
 * must not pre-assume the mime type is already valid.
 */
export interface UnvalidatedAttachment {
	mimeType: string;
	data: string;
	width: number;
	height: number;
}
