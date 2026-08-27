import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const openapi = JSON.parse(readFileSync("apps/api/openapi/openapi.json", "utf8"));
const schemas = Object.keys(openapi.components?.schemas ?? {});
const counterSchemas = schemas.filter(name => /^(?:def-?\d+)$/i.test(name));
if (counterSchemas.length > 0) {
	throw new Error(`OpenAPI contains counter-named schemas: ${counterSchemas.join(", ")}`);
}

const expectedSchemas = [
	"AttachmentInput",
	"AttachmentResponse",
	"ErrorResponse",
	"GenerateTitleResponse",
	"Message",
	"Project",
	"ProjectIdResponse",
	"ProjectListItem",
	"RenameProjectResponse",
	"RollbackResponse",
	"Usage",
];
const missingSchemas = expectedSchemas.filter(name => !schemas.includes(name));
if (missingSchemas.length > 0) {
	throw new Error(`OpenAPI is missing semantic schemas: ${missingSchemas.join(", ")}`);
}

function getFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? getFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
	});
}

const generatedRoot = "packages/api-client/src/generated";
const generatedModelFiles = getFiles(join(generatedRoot, "types"));
const expectedModelFiles = [
	"AttachmentInput.ts",
	"AttachmentResponse.ts",
	"ErrorResponse.ts",
	"GenerateTitleResponse.ts",
	"Message.ts",
	"Project.ts",
	"ProjectIdResponse.ts",
	"ProjectListItem.ts",
	"RenameProjectResponse.ts",
	"RollbackResponse.ts",
	"Usage.ts",
];
const missingModels = expectedModelFiles.filter(
	file => !existsSync(join(generatedRoot, "types", file)),
);
if (missingModels.length > 0) {
	throw new Error(`Generated models missing semantic files: ${missingModels.join(", ")}`);
}
const counterModels = generatedModelFiles.filter(file => {
	const name = file.split(/[\\/]/).at(-1);
	return (
		/^(?:def\d+|def-\d+)(?:Item.*)?\.ts$/i.test(name ?? "") ||
		/\bDef\d+(?:Item[A-Za-z0-9]*)?\b/.test(readFileSync(file, "utf8"))
	);
});
if (counterModels.length > 0) {
	throw new Error(`Generated clients contain counter-named models: ${counterModels.join(", ")}`);
}
