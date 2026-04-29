export interface RoutingRules {
	structuredBuildPatterns: RegExp[];
	fencedJsonSpecPattern: RegExp;
}

export const ROUTING_RULES: RoutingRules = {
	structuredBuildPatterns: [
		// Core action + web noun with tolerance for distance (e.g. "whip up a super quick website")
		/\b(?:build|create|make|generate|deploy|spin\s*up|whip\s*up|hook\s*(?:me\s*)?up|set\s*up|launch|start)\b[\s\S]{0,100}?\b(?:website|site|app|landing\s*page|portfolio|blog|ecommerce|dashboard|saas|tool|project)\b/i,
		
		// "Need" or "want" a site (e.g. "i need a site lol can you make one")
		/\b(?:need|want)\b[\s\S]{0,50}?\b(?:website|site|app|landing\s*page)\b/i,
		
		// Builder / hosting references natively 
		/\b(?:with\s+(?:the\s+)?builder|website\s+builder|host\s+a\s+site)\b/i,
		
		// Online/basic generalizations (e.g. "make me something simple online", "spin up something basic")
		/\b(?:make|spin\s*up)\b[\s\S]{0,30}?\b(?:something\b.*?online|something\s+basic)\b/i,
		
		// Vague short anchored commands to catch "create it", "make one", "build something for me", etc. without falsely triggering mid-sentence Q&A
		/^\s*(?:can\s+(?:you|u)\s+(?:just\s+)?(?:please\s+)?)?(?:build\s+(?:something|whatever)(?:\s+you\s+think\s+is\s+best)?|create\s+it|make\s+one|start\s+a\s+project|launch\s+something|set\s+up\s+a\s+site|generate\s+something)(?:\s+(?:for\s+me|cool|I\s+guess))?[\W]*$/i,
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
