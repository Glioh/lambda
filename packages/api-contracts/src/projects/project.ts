import { Type, type Static } from "typebox";
import { DateTimeSchema } from "../common/datetime.js";

export const ProjectListItemSchema = Type.Object(
	{
		id: Type.String(),
		name: Type.String(),
		createdAt: DateTimeSchema,
		updatedAt: DateTimeSchema,
	},
	{ $id: "ProjectListItem" },
);
export type ProjectListItem = Static<typeof ProjectListItemSchema>;

export const ProjectSchema = Type.Object(
	{
		...ProjectListItemSchema.properties,
		titleGeneratedAt: Type.Union([DateTimeSchema, Type.Null()]),
	},
	{ $id: "Project" },
);
export type Project = Static<typeof ProjectSchema>;
