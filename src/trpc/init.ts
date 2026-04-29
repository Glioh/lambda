import { auth } from "@clerk/nextjs/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import superjson from "superjson";
import { consumeCredits } from "@/lib/usage";

export const createTRPCContext = cache(async () => {
	return { auth: await auth() };
});

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const logLatency = (
	traceId: string | undefined,
	step: string,
	startTime: number,
	details?: Record<string, unknown>,
) => {
	console.log("[chat-latency]", {
		traceId: traceId ?? "unknown",
		step,
		elapsedMs: Date.now() - startTime,
		...details,
	});
};

const t = initTRPC.context<Context>().create({
	/**
	 * @see: https://trpc.io/docs/server/data-transformers
	 */
	transformer: superjson,
});

const isAuthed = t.middleware(({ next, ctx }) => {
	if (!ctx.auth.userId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated",
		});
	}
	return next({
		ctx: {
			auth: ctx.auth,
		},
	});
});

const hasUsageCredits = t.middleware(async ({ next, input }) => {
	const startTime = Date.now();

	try {
		const traceId =
			input &&
			typeof input === "object" &&
			"debugTraceId" in input &&
			typeof input.debugTraceId === "string"
				? input.debugTraceId
				: undefined;

		logLatency(traceId, "trpc.usageMiddleware.start", startTime);
		await consumeCredits(traceId);
		logLatency(traceId, "trpc.usageMiddleware.complete", startTime);
		return next();
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "User not authenticated") {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Not authenticated",
				});
			}

			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Something went wrong",
			});
		}

		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "You have run out of credits",
		});
	}
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const usageProtectedProcedure = protectedProcedure.use(hasUsageCredits);
