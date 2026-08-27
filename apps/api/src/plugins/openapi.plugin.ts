import fastifySwagger from "@fastify/swagger";
import fp from "fastify-plugin";

export const openApiPlugin = fp(
	async app => {
		app.register(fastifySwagger, {
			openapi: {
				openapi: "3.1.0",
				info: { title: "Lambda API", version: "0.1.0" },
			},
			refResolver: {
				buildLocalReference: (json, _baseUri, _fragment, i) =>
					typeof json.$id === "string" ? json.$id : `def-${i}`,
			},
		});
	},
	{
		name: "lambda-api-openapi",
		fastify: "5.x",
	},
);
