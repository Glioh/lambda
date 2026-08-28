import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const webFiles = ["apps/web/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"];
const typescriptFiles = ["apps/api/**/*.{ts,mts,cts}", "apps/web/**/*.{ts,tsx,mts,cts}"];
const scopeTo = files => config => (config.ignores ? config : { ...config, files });

const eslintConfig = [
	...nextCoreWebVitals.map(scopeTo(webFiles)),
	...nextTypescript.map(scopeTo(typescriptFiles)),
	{
		ignores: ["**/node_modules/**", "**/.next/**", "**/out/**", "**/build/**", "**/next-env.d.ts"],
	},
];

export default eslintConfig;
