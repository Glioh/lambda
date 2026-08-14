import { messagesRouter } from "@/modules/messages/server/procedures";
import { projectsRouter } from "@/modules/projects/server/procedures";
import { usageRouter } from "@/modules/usage/server/procedures";
import { createTRPCRouter } from "../init";

/**
 * Root application tRPC router.
 *
 * Mounts message, project, and usage routers under their namespaces.
 */
export const appRouter = createTRPCRouter({
	messages: messagesRouter,
	projects: projectsRouter,
	usage: usageRouter,
});
// export type definition of API
/** Inferred RPC router contract shared with clients. */
export type AppRouter = typeof appRouter;
