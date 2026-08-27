import { ACCEPTED_IMAGE_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, MAX_BASE64_CHARS, MAX_TOTAL_ATTACHMENT_BYTES, type AttachmentInput, } from "../contracts/index.js";

export class AttachmentValidationError extends Error {}

const MAGIC_BYTES: Record<string, (bytes: Buffer) => boolean> = {
	"image/png": bytes =>
		bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	"image/jpeg": bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
	"image/webp": bytes =>
		bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
		bytes.subarray(8, 12).toString("latin1") === "WEBP",
	"image/gif": bytes => bytes.subarray(0, 4).toString("latin1") === "GIF8",
};

export function validateAttachments(inputs: AttachmentInput[]) {
	if (inputs.length > MAX_ATTACHMENTS_PER_MESSAGE) {
		throw new AttachmentValidationError(
			`You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} images per message.`,
		);
	}

	let totalBytes = 0;
	return inputs.map(input => {
		if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(input.mimeType)) {
			throw new AttachmentValidationError(`Unsupported image type: ${input.mimeType}.`);
		}
		if (
			!Number.isInteger(input.width) ||
			!Number.isInteger(input.height) ||
			input.width <= 0 ||
			input.height <= 0
		) {
			throw new AttachmentValidationError("Image dimensions are invalid.");
		}
		if (input.data.length > MAX_BASE64_CHARS) {
			throw new AttachmentValidationError("Each image must be under 4MB.");
		}

		const bytes = Buffer.from(input.data, "base64");
		if (bytes.length === 0 || bytes.toString("base64") !== normalize(input.data)) {
			throw new AttachmentValidationError("Image data is not valid base64.");
		}
		if (bytes.length < 12) {
			throw new AttachmentValidationError("Image data is too small to be valid.");
		}
		if (bytes.length > MAX_ATTACHMENT_BYTES) {
			throw new AttachmentValidationError("Each image must be under 4MB.");
		}
		if (!MAGIC_BYTES[input.mimeType]?.(bytes)) {
			throw new AttachmentValidationError(
				`File contents don't match the declared type ${input.mimeType}.`,
			);
		}

		totalBytes += bytes.length;
		if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
			throw new AttachmentValidationError(
				"Attachments total more than 3MB. Try fewer or smaller images.",
			);
		}
		return { ...input, byteSize: bytes.length };
	});
}

function normalize(value: string) {
	return value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
}
