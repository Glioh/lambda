export interface RoutingRules {
	structuredBuildPatterns: RegExp[];
	fencedJsonSpecPattern: RegExp;
	followUpModificationPatterns: RegExp[];
	clearChatIntentPatterns: RegExp[];
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

	followUpModificationPatterns: [
		// "make/change/update it/that/this" — modification verb + pronoun
		/\b(?:make|change|update|modify|edit|adjust|tweak|fix|improve)\s+(?:it|that|this)\b/i,

		// Color/style/size swap: "make it red", "change to dark mode"
		/\b(?:make|change|switch|turn|set)\b[\s\S]{0,30}?\b(?:red|blue|green|yellow|purple|pink|orange|white|black|dark(?:\s*mode)?|light(?:\s*mode)?|bigger|smaller|larger|rounded|bold|italic|transparent)\b/i,

		// "add/remove/move/replace the X" — structural change to existing UI
		/\b(?:add|remove|delete|move|swap|replace|resize|center|align|hide|show|reorder)\s+(?:the|a|an|some)\s+\w+/i,

		// "Can you [modification verb]" — polite modification request
		/\b(?:can\s+(?:you|u)\s+(?:(?:please|just)\s+)?(?:make|change|update|add|remove|fix|move|swap|replace))\b/i,

		// Referring to specific UI elements from prior build
		/\b(?:the\s+(?:header|footer|navbar?|sidebar|button|form|input|card|modal|menu|title|text|image|logo|background|layout|section|hero|banner|page|link|icon|font|color|style|border|padding|margin))\b/i,

		// "use X instead" / "try X instead"
		/\b(?:use|try|go\s+with)\b[\s\S]{0,30}?\b(?:instead|rather)\b/i,

		// Short imperative at start: "now make...", "also add..."
		/^\s*(?:now\s+|also\s+)?(?:make|change|update|add|remove|fix|move|try|use|put|set)\s/i,
	],

	clearChatIntentPatterns: [
		// Conceptual questions — not modifying anything
		/\b(?:what\s+(?:is|are|does)|explain(?:\s+to\s+me)?|how\s+(?:does|do|is|are)\s+\w+\s+work|why\s+(?:does|do|is|are)|tell\s+me\s+about|what(?:'s|\s+is)\s+the\s+difference)\b/i,

		// Pure greetings / thanks (entire message)
		/^\s*(?:hi|hello|hey|thanks?|thank\s+you|good\s+(?:morning|afternoon|evening))\s*[.!?]*\s*$/i,
	],
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

export function isFollowUpModification(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	return rules.followUpModificationPatterns.some((pattern) =>
		pattern.test(value),
	);
}

export function isClearChatIntent(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	return rules.clearChatIntentPatterns.some((pattern) => pattern.test(value));
}
