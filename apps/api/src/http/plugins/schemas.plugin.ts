import fp from "fastify-plugin";
import { reusableSchemas } from "@lambda/api-contracts/reusable-schemas";

export const schemasPlugin = fp(
	async app => {
		for (const schema of reusableSchemas) app.addSchema(schema);
	},
	{
		name: "lambda-api-schemas",
		fastify: "5.x",
	},
);
