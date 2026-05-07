"use client";

import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { RunWithLineage, RunLineage } from "../types";

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled"]);

/**
 * Builds lineage chains by walking retriedFromRunId to the root.
 * Groups all runs sharing the same root into a RunLineage, ordered oldest-first.
 */
function buildLineages(runs: RunWithLineage[]): RunLineage[] {
	const byId = new Map(runs.map((r) => [r.id, r]));
	const visited = new Set<string>();
	const lineages: RunLineage[] = [];

	for (const run of runs) {
		if (visited.has(run.id)) continue;

		// Walk to root
		let root = run;
		while (root.retriedFromRunId && byId.has(root.retriedFromRunId)) {
			root = byId.get(root.retriedFromRunId)!;
		}

		// Collect entire chain from root downward
		const chain: RunWithLineage[] = [];
		const queue = [root.id];
		while (queue.length > 0) {
			const id = queue.shift()!;
			const node = byId.get(id);
			if (!node || visited.has(id)) continue;
			visited.add(id);
			chain.push(node);
			for (const retry of node.retries) {
				if (byId.has(retry.id)) {
					queue.push(retry.id);
				}
			}
		}

		// Sort oldest-first
		chain.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);

		lineages.push({
			originalRunId: root.id,
			messageId: root.messageId,
			runs: chain,
		});
	}

	return lineages;
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
			(runs as RunWithLineage[]).find((r) => !TERMINAL_STATUSES.has(r.status)) ??
			null,
		[runs],
	);

	const hasActiveBuild = activeRun !== null;

	return { runs: runs as RunWithLineage[], lineages, activeRun, hasActiveBuild };
}
