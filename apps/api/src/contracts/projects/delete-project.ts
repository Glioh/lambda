import { Type } from "typebox";

export const ProjectIdResponseSchema = Type.Object(
	{ id: Type.String() },
	{ $id: "ProjectIdResponse" },
);
