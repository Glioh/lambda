import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AttachmentValidationError, validateAttachments } from "../src/attachments.js";
import { ATTACHMENT_REQUEST_BODY_LIMIT } from "../src/constants.js";
import { CreateMessageBodySchema, CreateProjectBodySchema, ErrorResponseSchema, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, MAX_TOTAL_ATTACHMENT_BYTES, } from "../src/contracts/index.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString(
	"base64",
);

describe("API boundary behavior", () => {
	it("keeps attachment limits separate from transport body limit", () => {
		assert.equal(MAX_ATTACHMENT_BYTES, 4 * 1024 * 1024);
		assert.equal(MAX_TOTAL_ATTACHMENT_BYTES, 3 * 1024 * 1024);
		assert.equal(MAX_ATTACHMENTS_PER_MESSAGE, 4);
		assert.ok(ATTACHMENT_REQUEST_BODY_LIMIT > MAX_TOTAL_ATTACHMENT_BYTES);
	});

	it("defines Fastify-compatible error responses", () => {
		assert.deepEqual(Object.keys(ErrorResponseSchema.properties).sort(), [
			"code",
			"error",
			"message",
			"statusCode",
		]);
		assert.deepEqual(ErrorResponseSchema.required, ["statusCode", "error", "message"]);
	});

	it("keeps project and message create contracts independently owned", () => {
		assert.notEqual(CreateProjectBodySchema, CreateMessageBodySchema);
		assert.deepEqual(CreateProjectBodySchema.properties, CreateMessageBodySchema.properties);
	});

	it("validates content type against declared image MIME", () => {
		const [attachment] = validateAttachments([
			{ mimeType: "image/png", data: png, width: 1, height: 1 },
		]);
		assert.equal(attachment.byteSize, 12);
		assert.throws(
			() => validateAttachments([{ mimeType: "image/jpeg", data: png, width: 1, height: 1 }]),
			AttachmentValidationError,
		);
	});
});
