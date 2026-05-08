"use client";

import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { RunWithLineage, RunLineage } from "../types";

function buildLineages(runs: RunWithLineage[]): RunLineage[] {
	return runs.map((run) => ({
		originalRunId: run.id,
		messageId: run.messageId,
		runs: [run],
	}));
}

export function useProjectRuns(projectId: string) {
	const trpc = useTRPC();

	const { data: runs } = useSuspenseQuery(
		trpc.routing.getRunsForProject.queryOptions(
			{ projectId },
			{ refetchInterval: 1500 },
		),
	);

	const lineages = useMemo(
		() => buildLineages(runs as RunWithLineage[]),
		[runs],
	);

	const activeRun = useMemo(
		() =>
			(runs as RunWithLineage[]).find(
				(r) => r.status === "dispatched" || r.status === "running",
			) ??
			null,
		[runs],
	);

	const hasActiveBuild = activeRun !== null;

	return { runs: runs as RunWithLineage[], lineages, activeRun, hasActiveBuild };
}
