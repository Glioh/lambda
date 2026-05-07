"use client";

import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useRunActions(projectId: string) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries(
				trpc.routing.getRunsForProject.queryOptions({ projectId }),
			),
			queryClient.invalidateQueries(
				trpc.messages.getMany.queryOptions({ projectId }),
			),
		]);
	};

	const confirmMutation = useMutation(
		trpc.routing.confirmRun.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		}),
	);

	const cancelMutation = useMutation(
		trpc.routing.cancelRun.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		}),
	);

	const retryMutation = useMutation(
		trpc.routing.retryRun.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		}),
	);

	const confirm = async (runId: string, draftValue?: string) => {
		await confirmMutation.mutateAsync({ runId, draftValue });
	};

	const cancel = async (runId: string) => {
		await cancelMutation.mutateAsync({ runId });
	};

	const retry = async (runId: string) => {
		await retryMutation.mutateAsync({ runId });
	};

	const isPending =
		confirmMutation.isPending ||
		cancelMutation.isPending ||
		retryMutation.isPending;

	return { confirm, cancel, retry, isPending };
}
