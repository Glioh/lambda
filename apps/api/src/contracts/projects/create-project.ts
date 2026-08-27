import { Type } from "typebox";
import { AttachmentInputSchema, MAX_ATTACHMENTS_PER_MESSAGE } from "../attachments/attachment.js";
import { schemaRef } from "../schema-ref.js";

export const CreateProjectBodySchema = Type.Object(
	{
		value: Type.String({ maxLength: 10_000 }),
		attachments: Type.Optional(
			Type.Array(schemaRef(AttachmentInputSchema), { maxItems: MAX_ATTACHMENTS_PER_MESSAGE }),
		),
	},
	{},
);
