import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";
const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: createTRPCContext,
		onError({ error, path, type }) {
			console.error(`[tRPC] ${type} ${path ?? "<unknown>"}`, error);
		},
	});
export { handler as GET, handler as POST };
