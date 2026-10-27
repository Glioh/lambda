import type { Static } from "typebox";
import { Type } from "typebox";
import { ResponseDateTime } from "../common/datetime.js";

export const ProjectListItemSchema = Type.Object(
	{
		id: Type.String(),
		name: Type.String(),
		titleFinalized: Type.Boolean(),
		createdAt: ResponseDateTime(),
		updatedAt: ResponseDateTime(),
	},
	{ $id: "ProjectListItem" },
);
export type ProjectListItem = Static<typeof ProjectListItemSchema>;

export const ProjectSchema = Type.Object(
	{
		...ProjectListItemSchema.properties,
	},
	{ $id: "Project" },
);
export type Project = Static<typeof ProjectSchema>;
