export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_BASE64_CHARS = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4;

export type AttachmentInput = {
	mimeType: (typeof ACCEPTED_IMAGE_TYPES)[number];
	data: string;
	width: number;
	height: number;
};
