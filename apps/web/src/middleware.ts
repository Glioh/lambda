import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { DEV_NO_AUTH } from "@/lib/dev-auth";

const isPublicRoute = createRouteMatcher([
	"/",
	"/sign-in(.*)",
	"/sign-up(.*)",
	"/api(.*)",
	"/pricing(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
	// Dev escape hatch: don't gate any route behind login.
	if (!DEV_NO_AUTH && !isPublicRoute(req)) {
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
