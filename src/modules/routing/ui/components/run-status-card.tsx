"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLinkIcon, ClockIcon } from "lucide-react";
import { useMemo } from "react";
import { format } from "date-fns";
import type { RunLineage } from "../types";
import { RunStatusBadge } from "./run-status-badge";
import { RunErrorDisplay } from "./run-error-display";
import { RunLineageNav } from "./run-lineage-nav";

interface RunStatusCardProps {
	lineage: RunLineage;
	activeRunId: string;
	onRunSelect: (runId: string) => void;
	onOpenWorkspace: () => void;
}

export function RunStatusCard({
	lineage,
	activeRunId,
	onRunSelect,
	onOpenWorkspace,
}: RunStatusCardProps) {
	const run = useMemo(
		() =>
			lineage.runs.find((r) => r.id === activeRunId) ??
			lineage.runs[lineage.runs.length - 1],
		[lineage.runs, activeRunId],
	);

	if (!run) return null;

	const isFailed = run.status === "failed";
	const isSuccess = run.status === "success";
	const isActive = run.status === "dispatched" || run.status === "running";

	return (
		<div
			className={cn(
				"rounded-lg border bg-card/50 p-3 space-y-2.5",
				"text-sm transition-colors",
				isActive && "border-blue-200/60 dark:border-blue-500/20",
				isFailed && "border-red-200/40 dark:border-red-500/15",
				isSuccess && "border-emerald-200/60 dark:border-emerald-500/20",
			)}
		>
			{/* Header: status badge + timestamp */}
			<div className="flex items-center justify-between gap-2">
				<RunStatusBadge status={run.status} />
				{run.completedAt ? (
					<span className="text-[10px] text-muted-foreground flex items-center gap-1">
						<ClockIcon className="size-2.5" />
						{format(new Date(run.completedAt), "HH:mm")}
					</span>
				) : null}
			</div>

			{/* Error display for failed runs */}
			{isFailed && run.failureCategory && (
				<RunErrorDisplay
					failureCategory={run.failureCategory}
					errorSummary={run.errorSummary}
				/>
			)}

			{isSuccess && (
				<div className="flex items-center gap-1.5 flex-wrap">
					<Button
						variant="outline"
						size="sm"
						className="h-7 px-2.5 text-xs gap-1 border-emerald-200/60 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
						onClick={onOpenWorkspace}
					>
						<ExternalLinkIcon className="size-3" />
						View result
					</Button>
				</div>
			)}

			{/* Lineage nav for multi-attempt runs */}
			<RunLineageNav
				lineage={lineage}
				activeRunId={activeRunId}
				onSelect={onRunSelect}
			/>
		</div>
	);
}
