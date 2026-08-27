import { Type } from "typebox";

export const GenerateTitleResponseSchema = Type.Union(
	[Type.Object({ id: Type.String(), name: Type.String() }), Type.Null()],
	{ $id: "GenerateTitleResponse" },
);
