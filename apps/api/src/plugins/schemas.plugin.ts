import type { TSchema } from "typebox";
import fp from "fastify-plugin";
import { IsKind, IsSchema } from "typebox";
import * as contracts from "../contracts/index.js";

type TypeBoxSchema = TSchema & { $id?: unknown; "~kind"?: unknown };

function isTypeBoxSchema(value: unknown): value is TypeBoxSchema {
	if (!IsSchema(value)) return false;

	// IsSchema accepts generic JSON Schema values too.
	// TypeBox's ~kind branding distinguishes actual TypeBox-created schemas.
	const kind = (value as { "~kind"?: unknown })["~kind"];
	return typeof kind === "string" && IsKind(value, kind);
}

export const schemasPlugin = fp(
	async app => {
		for (const value of Object.values(contracts) as unknown[]) {
			if (!isTypeBoxSchema(value)) continue;

			const id = value.$id;
			if (id === undefined) continue;
			if (typeof id !== "string" || id.length === 0 || id !== id.trim()) {
				throw new Error("Reusable API schemas require a valid non-empty $id.");
			}

			app.addSchema(value);
		}
	},
	{
		name: "lambda-api-schemas",
		fastify: "5.x",
	},
);
