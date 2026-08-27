import { Type } from "typebox";

export const ProjectIdParamsSchema = Type.Object(
	{
		projectId: Type.String({ minLength: 1 }),
	},
	{},
);
