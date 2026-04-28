export interface RoutingRules {
	structuredBuildPatterns: RegExp[];
	fencedJsonSpecPattern: RegExp;
	explicitChatMarkers: string[];
}

const DEFAULT_ROUTING_RULES: RoutingRules = {
	structuredBuildPatterns: [
		/\bbuild\s+(a|me|the)\s+(website|app|landing|dashboard|saas|tool|page|site)\b/i,
		/\bcreate\s+a\s+(next|react|vite|nextjs)\s+(app|project)\b/i,
		/\bgenerate\s+(an?|the)\s+(app|website|landing|dashboard)\b/i,
	],
	fencedJsonSpecPattern:
		/```json\s*[\s\S]*\b(spec|requirements)\b[\s\S]*```/i,
	explicitChatMarkers: [
		"starts-with-question-word",
		"?",
		"explain",
		"how does",
		"what is",
		"summarize",
		"brainstorm",
		"tell me about",
	],
};

interface RoutingRulesOverride {
	structuredBuildPatterns?: string[];
	fencedJsonSpecPattern?: string;
	explicitChatMarkers?: string[];
}

function loadRoutingRules(): RoutingRules {
	const rawRules = process.env.LAMBDA_ROUTING_RULES_JSON;

	if (!rawRules) {
		return DEFAULT_ROUTING_RULES;
	}

	try {
		const parsed = JSON.parse(rawRules) as RoutingRulesOverride;

		return {
			structuredBuildPatterns: parsed.structuredBuildPatterns
				? parsed.structuredBuildPatterns.map((pattern) => new RegExp(pattern, "i"))
				: DEFAULT_ROUTING_RULES.structuredBuildPatterns,
			fencedJsonSpecPattern: parsed.fencedJsonSpecPattern
				? new RegExp(parsed.fencedJsonSpecPattern, "i")
				: DEFAULT_ROUTING_RULES.fencedJsonSpecPattern,
			explicitChatMarkers:
				parsed.explicitChatMarkers ?? DEFAULT_ROUTING_RULES.explicitChatMarkers,
		};
	} catch {
		return DEFAULT_ROUTING_RULES;
	}
}

export const ROUTING_RULES = loadRoutingRules();
