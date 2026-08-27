import { Type, type Static } from "typebox";

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_BASE64_CHARS = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4;

const MimeTypeSchema = Type.Union([
	Type.Literal("image/png"),
	Type.Literal("image/jpeg"),
	Type.Literal("image/webp"),
	Type.Literal("image/gif"),
]);

export const AttachmentInputSchema = Type.Object(
	{
		mimeType: MimeTypeSchema,
		data: Type.String({ minLength: 1, maxLength: MAX_BASE64_CHARS }),
		width: Type.Integer({ minimum: 1 }),
		height: Type.Integer({ minimum: 1 }),
	},
	{ $id: "AttachmentInput" },
);
export type AttachmentInput = Static<typeof AttachmentInputSchema>;

export const AttachmentResponseSchema = Type.Object(
	{
		id: Type.String(),
		mimeType: Type.String(),
		width: Type.Integer(),
		height: Type.Integer(),
	},
	{ $id: "AttachmentResponse" },
);
