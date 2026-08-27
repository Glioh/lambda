import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { staleTime: 30_000 },
			dehydrate: {
				shouldDehydrateQuery: query =>
					defaultShouldDehydrateQuery(query) || query.state.status === "pending",
			},
		},
	});
}

export function getQueryClient() {
	if (typeof window === "undefined") return makeQueryClient(); // SERVER
	return (browserQueryClient ??= makeQueryClient()); // BROWSER
}
