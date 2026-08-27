import { Type } from "typebox";

export const EditMessageBodySchema = Type.Object(
	{
		value: Type.String({ maxLength: 10_000 }),
	},
	{},
);
