export interface RoutingRules {
	structuredBuildPatterns: RegExp[];
	fencedJsonSpecPattern: RegExp;
}

export const ROUTING_RULES: RoutingRules = {
	structuredBuildPatterns: [
		/\bbuild\s+(a|me|the)\s+(website|app|landing|dashboard|saas|tool|page|site)\b/i,
		/\bcreate\s+a\s+(next|react|vite|nextjs)\s+(app|project)\b/i,
		/\bgenerate\s+(an?|the)\s+(app|website|landing|dashboard)\b/i,
	],
	fencedJsonSpecPattern:
		/```json\s*[\s\S]*\b(spec|requirements)\b[\s\S]*```/i,
};

export function isStructuredBuildIntent(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	return (
		rules.structuredBuildPatterns.some((pattern) => pattern.test(value)) ||
		rules.fencedJsonSpecPattern.test(value)
	);
}
