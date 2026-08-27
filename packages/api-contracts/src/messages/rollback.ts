import { Type, type Static } from "typebox";

export const RollbackResponseSchema = Type.Object(
	{
		value: Type.String(),
		hasAttachments: Type.Boolean(),
	},
	{ $id: "RollbackResponse" },
);
export type RollbackResult = Static<typeof RollbackResponseSchema>;
