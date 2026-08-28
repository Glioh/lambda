import type { UnvalidatedAttachment } from "../constants";
import { ACCEPTED_IMAGE_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, MAX_BASE64_CHARS, MAX_TOTAL_ATTACHMENT_BYTES, } from "../constants";

/** Attachment proven safe to persist, including decoded byte size. */
export interface ValidatedAttachment extends UnvalidatedAttachment {
	/** Decoded size, stored for quota accounting and shown in the UI. */
	byteSize: number;
}

/** Reports rejected attachment input at API validation boundary. */
export class AttachmentValidationError extends Error {}

/**
 * File-signature checks, keyed by the mime type the client *claims*.
 *
 * This is a security control, not a nicety: the stored mimeType is echoed back
 * as the `Content-Type` of /api/attachments/[id]. Without this, a client could
 * store HTML under `image/png`... or store real HTML bytes under an allowlisted
 * type and rely on sniffing. The allowlist, these magic bytes, and the
 * `nosniff` header at read time are three parts of one defense — don't drop any.
 */
const MAGIC_BYTES: Record<string, (bytes: Buffer) => boolean> = {
	"image/png": bytes =>
		bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	"image/jpeg": bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
	"image/webp": bytes =>
		bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
		bytes.subarray(8, 12).toString("latin1") === "WEBP",
	"image/gif": bytes => bytes.subarray(0, 4).toString("latin1") === "GIF8",
};

/** Smallest payload that could carry a checkable signature. */
const MIN_SIGNATURE_BYTES = 12;

/**
 * Re-validates client-supplied attachments before they are persisted.
 *
 * @param {UnvalidatedAttachment[]} inputs - The attachments as sent by the client.
 * @returns {ValidatedAttachment[]} The attachments, with decoded sizes attached.
 * @throws {AttachmentValidationError} When anything fails the checks above.
 */
export function validateAttachments(inputs: UnvalidatedAttachment[]): ValidatedAttachment[] {
	if (inputs.length > MAX_ATTACHMENTS_PER_MESSAGE) {
		throw new AttachmentValidationError(
			`You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} images per message.`,
		);
	}

	const validated: ValidatedAttachment[] = [];
	let totalBytes = 0;

	for (const input of inputs) {
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

		// Bound the string before decoding. Buffer.from would happily allocate a
		// buffer for a 100MB payload first and only then fail the size check below.
		if (input.data.length > MAX_BASE64_CHARS) {
			throw new AttachmentValidationError(
				`Each image must be under ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB.`,
			);
		}

		const bytes = Buffer.from(input.data, "base64");

		// Buffer.from is lenient — it skips invalid characters rather than
		// throwing. Re-encoding and comparing is what actually proves the input
		// was well-formed base64 and not arbitrary text.
		if (bytes.length === 0 || bytes.toString("base64") !== normalize(input.data)) {
			throw new AttachmentValidationError("Image data is not valid base64.");
		}

		if (bytes.length < MIN_SIGNATURE_BYTES) {
			throw new AttachmentValidationError("Image data is too small to be valid.");
		}

		if (bytes.length > MAX_ATTACHMENT_BYTES) {
			throw new AttachmentValidationError(
				`Each image must be under ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB.`,
			);
		}

		if (!MAGIC_BYTES[input.mimeType]?.(bytes)) {
			throw new AttachmentValidationError(
				`File contents don't match the declared type ${input.mimeType}.`,
			);
		}

		totalBytes += bytes.length;

		if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
			throw new AttachmentValidationError(
				`Attachments total more than ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024)}MB. Try fewer or smaller images.`,
			);
		}

		validated.push({ ...input, byteSize: bytes.length });
	}

	return validated;
}

/**
 * Normalizes base64 for the round-trip comparison: strips whitespace and
 * converts URL-safe alphabet to standard, so a legitimately-encoded payload
 * isn't rejected over cosmetic differences.
 * @param {string} value - The raw base64 string.
 * @returns {string} The normalized form.
 */
function normalize(value: string): string {
	return value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
}
