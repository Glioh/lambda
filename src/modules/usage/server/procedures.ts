import { getUsageStatus } from "@/lib/usage";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

/** tRPC router for retrieving authenticated user usage status. */
export const usageRouter = createTRPCRouter({
	status: protectedProcedure.query(async () => {
		const result = await getUsageStatus();
		return result;
	}),
});
