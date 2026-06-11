import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
	"/",
	"/sign-in(.*)",
	"/sign-up(.*)",
	"/api(.*)",
	"/pricing(.*)",
]);

// Dev-only: when DEV_AUTH_BYPASS=1 (outside production), skip route protection so
// the app can be driven locally without completing the Clerk sign-in flow.
const DEV_AUTH_BYPASS =
	process.env.DEV_AUTH_BYPASS === "1" &&
	process.env.NODE_ENV !== "production";

export default clerkMiddleware(async (auth, req) => {
	if (!DEV_AUTH_BYPASS && !isPublicRoute(req)) {
		await auth.protect();
	}
});

export const config = {
	matcher: [
		// Skip Next.js internals and all static files, unless found in search params
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
