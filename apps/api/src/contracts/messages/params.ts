import { Type } from "typebox";

export const MessageParamsSchema = Type.Object(
	{
		projectId: Type.String({ minLength: 1 }),
		messageId: Type.String({ minLength: 1 }),
	},
	{},
);
