"use client";

import { cn } from "@/lib/utils";
import type { RunLineage } from "../types";
import type { RunStatus } from "@prisma/client";

const DOT_COLORS: Record<RunStatus, string> = {
	waiting_confirmation: "bg-amber-400",
	confirmed: "bg-amber-400",
	dispatched: "bg-blue-400",
	running: "bg-blue-400",
	success: "bg-emerald-400",
	failed: "bg-red-400",
	cancelled: "bg-zinc-400",
};

interface RunLineageNavProps {
	lineage: RunLineage;
	activeRunId: string;
	onSelect: (runId: string) => void;
}

export function RunLineageNav({
	lineage,
	activeRunId,
	onSelect,
}: RunLineageNavProps) {
	if (lineage.runs.length <= 1) return null;

	return (
		<div className="flex items-center gap-1 flex-wrap">
			{lineage.runs.map((run, index) => {
				const isActive = run.id === activeRunId;
				return (
					<button
						key={run.id}
						onClick={() => onSelect(run.id)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-2 py-0.5",
							"text-[11px] font-medium transition-colors",
							isActive
								? "bg-secondary text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
						)}
					>
						<span
							className={cn(
								"size-1.5 rounded-full shrink-0",
								DOT_COLORS[run.status],
							)}
						/>
						<span>#{index + 1}</span>
					</button>
				);
			})}
		</div>
	);
}
