/**
 * Builds the API with deterministic test dependencies and writes the registered routes and schemas to
 * apps/api/openapi.json. This keeps the checked-in API description synchronized for drift checks and client generation.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildApp } from "../apps/api/src/app.js";

const outputPath = resolve("apps/api/openapi.json");

const main = async () => {
	const app = buildApp({
		logger: false,
		principalResolver: () => ({ userId: "openapi-generation", sessionId: "openapi-generation" }),
		proPlanResolver: () => false,
	});

	try {
		await app.ready();
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, `${JSON.stringify(app.swagger(), null, 2)}\n`, "utf8");
	} finally {
		await app.close();
	}
};

void main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
