import type { Static } from "typebox";
import { Type } from "typebox";
import { AttachmentResponseSchema } from "../attachments/attachment.js";
import { ResponseDateTime } from "../common/datetime.js";
import { schemaRef } from "../schema-ref.js";

// API response for a persisted message, including server-generated metadata.
export const MessageSchema = Type.Object(
	{
		id: Type.String(),
		content: Type.String(),
		role: Type.Union([Type.Literal("USER"), Type.Literal("ASSISTANT")]),
		type: Type.Union([Type.Literal("RESULT"), Type.Literal("ERROR"), Type.Literal("SUMMARY")]),
		createdAt: ResponseDateTime(),
		updatedAt: ResponseDateTime(),
		attachments: Type.Array(schemaRef(AttachmentResponseSchema)),
	},
	{ $id: "Message" },
);
export type Message = Static<typeof MessageSchema>;
