import { Type } from "typebox";

export const RenameProjectBodySchema = Type.Object({ name: Type.String() }, {});

export const RenameProjectResponseSchema = Type.Object(
	{
		id: Type.String(),
		name: Type.String(),
	},
	{ $id: "RenameProjectResponse" },
);
