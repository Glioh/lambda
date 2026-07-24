import { auth } from "@clerk/nextjs/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import superjson from "superjson";
import { consumeCredits } from "@/lib/usage";
import { DEV_FAKE_USER_ID, DEV_NO_AUTH } from "@/lib/dev-auth";

export const createTRPCContext = cache(async () => {
	const resolved = await auth();
	// Dev escape hatch: act as a fixed local user when nobody is signed in.
	if (DEV_NO_AUTH && !resolved.userId) {
		return { auth: { ...resolved, userId: DEV_FAKE_USER_ID } };
	}
	return { auth: resolved };
});

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

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

const hasUsageCredits = t.middleware(async ({ next }) => {
	try {
		await consumeCredits();
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
