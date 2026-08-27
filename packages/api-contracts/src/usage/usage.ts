import { Type } from "typebox";

export const UsageSchema = Type.Object(
	{
		remainingPoints: Type.Number(),
		msBeforeNext: Type.Number(),
	},
	{ $id: "Usage" },
);
