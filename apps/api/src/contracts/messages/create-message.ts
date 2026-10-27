import type { Static } from "typebox";
import { Type } from "typebox";
import { MAX_VALUE_CHARS } from "../../constants.js";
import { AttachmentInputSchema, MAX_ATTACHMENTS_PER_MESSAGE } from "../attachments/attachment.js";
import { schemaRef } from "../schema-ref.js";

// Request payload accepted from the client when creating a message.
const MessageInputSchema = Type.Object(
	{
		value: Type.String({ maxLength: MAX_VALUE_CHARS }),
		attachments: Type.Optional(
			Type.Array(schemaRef(AttachmentInputSchema), { maxItems: MAX_ATTACHMENTS_PER_MESSAGE }),
		),
	},
	{},
);

export type MessageInput = Static<typeof MessageInputSchema>;

export const CreateMessageBodySchema = Type.Object(MessageInputSchema.properties, {});
