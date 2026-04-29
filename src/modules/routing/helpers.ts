import type { RoutingDecision, RoutingInput } from "./types";
import { decideRoute } from "./router";

/**
 * Build a routing decision from input.
 */
export function resolveRoutingDecision(input?: RoutingInput): RoutingDecision {
	// Empty string is intentional for routing-only validation paths.
	return decideRoute({ value: "", routing: input });
}
