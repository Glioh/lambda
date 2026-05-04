import { artifactsRouter } from "@/modules/artifacts/server/procedures";
import { messagesRouter } from "@/modules/messages/server/procedures";
import { projectsRouter } from "@/modules/projects/server/procedures";
import { routingRouter } from "@/modules/routing/server/procedures";
import { usageRouter } from "@/modules/usage/server/procedures";
import { createTRPCRouter } from "../init";

export const appRouter = createTRPCRouter({
	artifacts: artifactsRouter,
	messages: messagesRouter,
	projects: projectsRouter,
	routing: routingRouter,
	usage: usageRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
