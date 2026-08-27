import { notFound } from "next/navigation";
import { ProjectView } from "@/modules/projects/ui/views/project-view";
import { makeQueryClient } from "@/lib/query-client";
import { getRequestErrorDetails } from "@/lib/request-error";
import { listMessagesQueryOptions } from "@lambda/api-client/query";
import { getProjectQueryOptions } from "@lambda/api-client/query";
import { createServerApiClient } from "@/lib/api/server-client";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Suspense } from "react";

interface Props {
	params: Promise<{
		projectId: string;
	}>;
}

const Page = async ({ params }: Props) => {
	const { projectId } = await params;
	const queryClient = makeQueryClient();
	const apiClient = await createServerApiClient();

	// fetchQuery, not prefetchQuery: prefetch swallows the rejection and still
	// dehydrates the query, so a chat that doesn't exist (or isn't yours) shipped
	// a promise that rejected on the client — leaving the page stuck on its
	// Suspense fallback forever. Failing here turns that into a real 404 instead.
	try {
		await queryClient.fetchQuery(
			getProjectQueryOptions({ path: { projectId } }, { client: apiClient }),
		);
	} catch (error) {
		if (getRequestErrorDetails(error).status === 404) notFound();
		throw error;
	}

	// Ownership is already settled by the query above, so a failure here is a
	// transient fault worth letting the client retry rather than a 404.
	try {
		await queryClient.prefetchQuery(
			listMessagesQueryOptions({ path: { projectId } }, { client: apiClient }),
		);
	} catch {
		// Let hydrated client query retry transient API failures.
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ErrorBoundary
				fallback={
					<div className="p-6 text-sm text-muted-foreground">
						Something went wrong loading this chat.
					</div>
				}
			>
				<Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
					<ProjectView projectId={projectId} />
				</Suspense>
			</ErrorBoundary>
		</HydrationBoundary>
	);
};

export default Page;
