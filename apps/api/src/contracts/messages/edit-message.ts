import { Type } from "typebox";
import { MAX_VALUE_CHARS } from "../../constants.js";

export const EditMessageBodySchema = Type.Object(
	{
		value: Type.String({ maxLength: MAX_VALUE_CHARS }),
	},
	{},
);
