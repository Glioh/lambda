import { notFound } from "next/navigation";
import { ProjectView } from "@/modules/projects/ui/views/project-view";
import { getQueryClient, trpc } from "@/trpc/server";
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
	const queryClient = getQueryClient();

	// fetchQuery, not prefetchQuery: prefetch swallows the rejection and still
	// dehydrates the query, so a chat that doesn't exist (or isn't yours) shipped
	// a promise that rejected on the client — leaving the page stuck on its
	// Suspense fallback forever. Failing here turns that into a real 404 instead.
	try {
		await queryClient.fetchQuery(
			trpc.projects.getOne.queryOptions({ id: projectId }),
		);
	} catch {
		notFound();
	}

	// Ownership is already settled by the query above, so a failure here is a
	// transient fault worth letting the client retry rather than a 404.
	await queryClient.prefetchQuery(
		trpc.messages.getMany.queryOptions({
			projectId: projectId,
		}),
	);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ErrorBoundary
				fallback={
					<div className="p-6 text-sm text-muted-foreground">
						Something went wrong loading this chat.
					</div>
				}
			>
				<Suspense
					fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}
				>
					<ProjectView projectId={projectId} />
				</Suspense>
			</ErrorBoundary>
		</HydrationBoundary>
	);
};

export default Page;
