import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	AttachmentValidationError,
	validateAttachments,
} from "@/modules/attachments/lib/validate";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_TOTAL_ATTACHMENT_BYTES,
} from "@/modules/attachments/constants";

/** A real 1x1 PNG. */
const PNG_1X1 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Builds a base64 payload of `bytes` length that still starts with a valid PNG
 * signature, so size limits can be tested independently of the magic-byte check.
 */
const pngOfSize = (bytes: number): string => {
	const signature = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);
	return Buffer.concat([
		signature,
		Buffer.alloc(Math.max(0, bytes - signature.length), 0x61),
	]).toString("base64");
};

const attachment = (overrides: Partial<Record<string, unknown>> = {}) => ({
	mimeType: "image/png",
	data: PNG_1X1,
	width: 1,
	height: 1,
	...overrides,
});

describe("validateAttachments", () => {
	it("accepts a well-formed PNG and reports its decoded size", () => {
		const [result] = validateAttachments([attachment()]);

		assert.equal(result.mimeType, "image/png");
		assert.equal(result.byteSize, Buffer.from(PNG_1X1, "base64").length);
	});

	it("accepts an empty list", () => {
		assert.deepEqual(validateAttachments([]), []);
	});

	it("rejects a mime type outside the allowlist", () => {
		assert.throws(
			() => validateAttachments([attachment({ mimeType: "text/html" })]),
			AttachmentValidationError,
		);
	});

	it("rejects contents that don't match the declared mime type", () => {
		// Real JPEG magic bytes, declared as PNG. This is the case that keeps a
		// crafted payload from being served back under a chosen Content-Type.
		const jpegBytes = Buffer.concat([
			Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
			Buffer.alloc(16, 0x00),
		]).toString("base64");

		assert.throws(
			() =>
				validateAttachments([
					attachment({ mimeType: "image/png", data: jpegBytes }),
				]),
			AttachmentValidationError,
		);
	});

	it("rejects data that is not valid base64", () => {
		assert.throws(
			() => validateAttachments([attachment({ data: "!!!not base64!!!" })]),
			AttachmentValidationError,
		);
	});

	it("rejects a single image over the per-image cap", () => {
		assert.throws(
			() =>
				validateAttachments([
					attachment({ data: pngOfSize(MAX_ATTACHMENT_BYTES + 1024) }),
				]),
			AttachmentValidationError,
		);
	});

	it("rejects a set over the total cap even when each image passes", () => {
		// Each is under the per-image cap; together they exceed the total.
		const each = Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 2) + 1024;

		assert.throws(
			() =>
				validateAttachments([
					attachment({ data: pngOfSize(each) }),
					attachment({ data: pngOfSize(each) }),
				]),
			AttachmentValidationError,
		);
	});

	it("rejects more than the per-message attachment count", () => {
		assert.throws(
			() =>
				validateAttachments(
					Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, () =>
						attachment(),
					),
				),
			AttachmentValidationError,
		);
	});

	it("rejects non-positive or non-integer dimensions", () => {
		assert.throws(
			() => validateAttachments([attachment({ width: 0 })]),
			AttachmentValidationError,
		);
		assert.throws(
			() => validateAttachments([attachment({ height: 1.5 })]),
			AttachmentValidationError,
		);
	});

	it("rejects a payload too short to carry a signature", () => {
		assert.throws(
			() => validateAttachments([attachment({ data: Buffer.from([0x89]).toString("base64") })]),
			AttachmentValidationError,
		);
	});
});
