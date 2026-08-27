import { spawnSync } from "node:child_process";

const generatedPaths = [
	"apps/api/openapi",
	"packages/api-contracts/src/generated",
	"packages/api-client/src/generated",
];
const diff = spawnSync("git", ["diff", "--exit-code", "--", ...generatedPaths], {
	encoding: "utf8",
});
const untracked = spawnSync(
	"git",
	["ls-files", "--others", "--exclude-standard", "--", ...generatedPaths],
	{ encoding: "utf8" },
);

if (diff.error || untracked.error) {
	console.error(
		`Unable to inspect generated API output: ${(diff.error ?? untracked.error).message}`,
	);
	process.exit(1);
}

if (![0, 1].includes(diff.status) || untracked.status !== 0) {
	console.error(diff.stderr.trim() || untracked.stderr.trim() || "Git inspection failed.");
	process.exit(1);
}

const changes = [
	diff.status === 1
		? spawnSync("git", ["diff", "--name-status", "--", ...generatedPaths], {
				encoding: "utf8",
			}).stdout.trimEnd()
		: "",
	untracked.stdout.trimEnd(),
]
	.filter(Boolean)
	.join("\n");
if (changes) {
	console.error("Generated API output is not clean:");
	console.error(changes);
	process.exit(1);
}
