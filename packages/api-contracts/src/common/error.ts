import { Type } from "typebox";

export const ErrorResponseSchema = Type.Object(
	{
		statusCode: Type.Number(),
		code: Type.Optional(Type.String()),
		error: Type.String(),
		message: Type.String(),
	},
	{ $id: "ErrorResponse" },
);
