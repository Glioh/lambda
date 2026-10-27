import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import readableOperations from "./tools/eslint-rules/readable-operations.mjs";

const webFiles = ["apps/web/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"];
const typescriptFiles = ["apps/api/**/*.{ts,mts,cts}", "apps/web/**/*.{ts,tsx,mts,cts}"];
const scopeTo = files => config => (config.ignores ? config : { ...config, files });

const eslintConfig = [
	...nextCoreWebVitals.map(scopeTo(webFiles)),
	...nextTypescript.map(scopeTo(typescriptFiles)),
	{
		files: ["apps/api/src/**/*.ts"],
		plugins: {
			lambda: {
				rules: {
					"readable-operations": readableOperations,
				},
			},
		},
		rules: {
			curly: ["error", "all"],
			"lambda/readable-operations": "error",
		},
	},
	{
		files: ["apps/api/src/services/**/*.service.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["./*.service.js"],
							message:
								"Do not import sibling service implementations. Shared input types belong in contracts; shared capabilities should have a neutral owner or be injected.",
						},
					],
				},
			],
		},
	},
	{
		ignores: ["**/node_modules/**", "**/.next/**", "**/out/**", "**/build/**", "**/next-env.d.ts"],
	},
];

export default eslintConfig;
