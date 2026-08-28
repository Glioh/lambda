import type { Static } from "typebox";
import { Type } from "typebox";
import { AttachmentResponseSchema } from "../attachments/attachment.js";
import { DateTimeSchema } from "../common/datetime.js";
import { schemaRef } from "../schema-ref.js";

export const MessageSchema = Type.Object(
	{
		id: Type.String(),
		content: Type.String(),
		role: Type.Union([Type.Literal("USER"), Type.Literal("ASSISTANT")]),
		type: Type.Union([Type.Literal("RESULT"), Type.Literal("ERROR"), Type.Literal("SUMMARY")]),
		createdAt: DateTimeSchema,
		updatedAt: DateTimeSchema,
		attachments: Type.Array(schemaRef(AttachmentResponseSchema)),
	},
	{ $id: "Message" },
);
export type Message = Static<typeof MessageSchema>;
