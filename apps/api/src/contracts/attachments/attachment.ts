import { Type } from "typebox";
import { MAX_BASE64_CHARS } from "../../attachments/policy.js";

export {
	ACCEPTED_IMAGE_TYPES,
	MAX_ATTACHMENT_BYTES,
	MAX_TOTAL_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_BASE64_CHARS,
} from "../../attachments/policy.js";
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
export type { AttachmentInput } from "../../attachments/policy.js";

export const AttachmentResponseSchema = Type.Object(
	{
		id: Type.String(),
		mimeType: Type.String(),
		width: Type.Integer(),
		height: Type.Integer(),
	},
	{ $id: "AttachmentResponse" },
);
