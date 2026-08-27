import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const generatedRoot = join(root, "packages/api-client/src/generated");

async function files(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const result = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await files(path)));
		else result.push(path);
	}
	return result;
}

async function snapshot() {
	const paths = (await files(generatedRoot)).sort();
	const values = await Promise.all(
		paths.map(async path => [path.slice(generatedRoot.length), await readFile(path)]),
	);
	return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function generate() {
	return new Promise((resolve, reject) => {
		const child = spawn("npm", ["run", "generate", "--workspace", "@lambda/api-client"], {
			cwd: root,
			stdio: "inherit",
			shell: true,
		});
		child.on("error", reject);
		child.on("exit", code => (code === 0 ? resolve() : reject(new Error(`Kubb exited ${code}`))));
	});
}

await generate();
const first = await snapshot();
await generate();
const second = await snapshot();
if (first !== second) throw new Error("Kubb generated output is not deterministic.");
console.log("Kubb generated output deterministic.");
