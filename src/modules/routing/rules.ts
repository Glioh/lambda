export interface RoutingRules {
	structuredBuildPatterns: RegExp[];
	fencedJsonSpecPattern: RegExp;
	followUpModificationPatterns: RegExp[];
	clearChatIntentPatterns: RegExp[];
}

export const ROUTING_RULES: RoutingRules = {
	structuredBuildPatterns: [
		// Core action + web noun with tolerance for distance (e.g. "whip up a super quick website")
		/\b(?:build|create|make|generate|deploy|spin\s*up|whip\s*up|hook\s*(?:me\s*)?up|set\s*up|launch|start)\b[\s\S]{0,100}?\b(?:website|web\s*page|site|app|landing\s*page|portfolio|blog|ecommerce|dashboard|saas|tool|project|page)\b/i,
		
		// "Need" or "want" a site (e.g. "i need a site lol can you make one")
		/\b(?:need|want)\b[\s\S]{0,50}?\b(?:website|web\s*page|site|app|landing\s*page|page)\b/i,
		
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

export const BUILD_ACTION_VERBS =
	/\b(?:build|create|make|generate|spin\s*up|launch|start)\b/i;

export const BUILD_TARGETS = [
	"page",
	"website",
	"webpage",
	"site",
	"app",
	"dashboard",
	"portfolio",
	"blog",
	"tool",
	"project",
] as const;

const QUESTION_GUARD =
	/^\s*(?:how\s+(?:do|can|would|should)\s+(?:I|you|we)|how\s+to\b|can\s+(?:I|you|we)\s+(?:learn|understand))/i;

/**
 * Determines whether the value should be classified as a structured build intent.
 *
 * This rejects clear chat/question intents first, then checks build-specific
 * patterns and JSON spec fences.
 *
 * @param value - The raw user message text.
 * @param rules - Routing rule definitions used for pattern matching.
 * @returns True when the input appears to be a build request.
 */
export function isStructuredBuildIntent(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	if (
		rules.clearChatIntentPatterns.some((pattern) => pattern.test(value)) ||
		QUESTION_GUARD.test(value)
	) {
		return false;
	}

	return (
		rules.structuredBuildPatterns.some((pattern) => pattern.test(value)) ||
		rules.fencedJsonSpecPattern.test(value)
	);
}

/**
 * Determines whether the input is a follow-up modification request.
 *
 * This is used to detect phrases like "make it red" or "add a button" when
 * the user is modifying an existing build.
 *
 * @param value - The raw user message text.
 * @param rules - Routing rule definitions used for pattern matching.
 * @returns True when the input appears to be a follow-up modification.
 */
export function isFollowUpModification(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	return rules.followUpModificationPatterns.some((pattern) =>
		pattern.test(value),
	);
}

/**
 * Determines whether the input is a clear chat intent.
 *
 * This covers conversational messages such as greetings, thanks, and
 * non-build questions that should not be routed to build intent flows.
 *
 * @param value - The raw user message text.
 * @param rules - Routing rule definitions used for pattern matching.
 * @returns True when the input appears to be clear chat.
 */
export function isClearChatIntent(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	return rules.clearChatIntentPatterns.some((pattern) => pattern.test(value));
}

/**
 * Computes the Levenshtein distance between two strings.
 *
 * This is used for fuzzy matching build target tokens such as "page" and
 * "site" when user text contains minor typos or alternate spacing.
 *
 * @param a - The first string to compare.
 * @param b - The second string to compare.
 * @returns The number of single-character edits required to transform `a` into `b`.
 */
export function levenshtein(a: string, b: string): number {
	const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	const current = new Array<number>(b.length + 1);

	for (let i = 1; i <= a.length; i++) {
		current[0] = i;

		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;

			current[j] = Math.min(
				current[j - 1] + 1,
				previous[j] + 1,
				previous[j - 1] + cost,
			);
		}

		for (let j = 0; j <= b.length; j++) {
			previous[j] = current[j];
		}
	}

	return previous[b.length];
}

/**
 * Determines whether the value is a fuzzy build intent.
 *
 * Fuzzy build intent detection is used for inputs that include build verbs and a
 * close match to a build target, even when the target has minor typos.
 *
 * @param value - The raw user message text.
 * @param rules - Routing rule definitions used for pattern matching.
 * @returns True when the input appears to be a fuzzy build request.
 */
export function isFuzzyBuildIntent(
	value: string,
	rules: typeof ROUTING_RULES,
): boolean {
	if (!BUILD_ACTION_VERBS.test(value)) {
		return false;
	}

	if (
		rules.clearChatIntentPatterns.some((pattern) => pattern.test(value)) ||
		QUESTION_GUARD.test(value)
	) {
		return false;
	}

	const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
	const tokens = normalized.split(" ");
	let verbIndex = -1;

	for (let index = 0; index < tokens.length; index++) {
		if (
			tokens[index] === "build" ||
			tokens[index] === "create" ||
			tokens[index] === "make" ||
			tokens[index] === "generate" ||
			tokens[index] === "launch" ||
			tokens[index] === "start" ||
			tokens[index] === "spinup"
		) {
			verbIndex = index;
			break;
		}

		if (tokens[index] === "spin" && tokens[index + 1] === "up") {
			verbIndex = index + 1;
			break;
		}
	}

	if (verbIndex === -1) {
		return false;
	}

	const window = tokens.slice(verbIndex + 1, verbIndex + 6);

	for (const token of window) {
		for (const target of BUILD_TARGETS) {
			if (token[0] !== target[0]) {
				continue;
			}

			const threshold = target.length <= 4 ? 1 : 2;
			const distance = levenshtein(token, target);

			if (distance > 0 && distance <= threshold) {
				return true;
			}
		}
	}

	return false;
}
