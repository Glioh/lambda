import { cookies } from "next/headers";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/modules/shell/ui/components/app-shell";
import { MarketingChrome } from "@/modules/shell/ui/components/marketing-chrome";
import { makeQueryClient } from "@/lib/query-client";
import { queryKeys, type ProjectListItem } from "@/api/client";
import { serverApiRequest } from "@/api/server-client";

/** The cookie SidebarProvider persists its open/closed state to. */
const SIDEBAR_COOKIE_NAME = "sidebar_state";

interface Props {
	children: React.ReactNode;
}

/**
 * Owns both `/` and `/projects/*` so the sidebar is not remounted when the user
 * switches chats. Branches on auth rather than redirecting, because `/` has to
 * serve the marketing page and the app shell at the same URL.
 * @param {Props} props - The layout props.
 * @returns {Promise<JSX.Element>} The rendered shell for the current viewer.
 */
const Layout = async ({ children }: Props) => {
	const { userId } = await auth();

	if (!userId) {
		return <MarketingChrome>{children}</MarketingChrome>;
	}

	const [cookieStore, queryClient] = [await cookies(), makeQueryClient()];
	// SidebarProvider writes this cookie but nothing read it until now; reading
	// it server-side is what stops the sidebar flashing open then collapsing.
	const defaultOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "false";

	await queryClient.prefetchQuery({
		queryKey: queryKeys.projects,
		queryFn: () => serverApiRequest<ProjectListItem[]>("/api/projects"),
	});

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<AppShell defaultOpen={defaultOpen}>{children}</AppShell>
		</HydrationBoundary>
	);
};

export default Layout;
