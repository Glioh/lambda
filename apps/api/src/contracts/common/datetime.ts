import { Type } from "typebox";

export const ResponseDateTime = () =>
	Type.Unsafe<Date>(
		Type.String({
			format: "date-time",
		}),
	);
