"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAvailableActions } from "@/modules/routing/ui-contracts";
import type { RunAction } from "@/modules/routing/ui-contracts";
import {
	CheckIcon,
	XIcon,
	RefreshCcwIcon,
	PencilIcon,
	ExternalLinkIcon,
	ClockIcon,
} from "lucide-react";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useRunContext } from "../context/run-context";
import type { RunLineage } from "../types";
import { RunStatusBadge } from "./run-status-badge";
import { RunErrorDisplay } from "./run-error-display";
import { RunLineageNav } from "./run-lineage-nav";
import { DraftEditor } from "./draft-editor";

interface RunStatusCardProps {
	lineage: RunLineage;
	activeRunId: string;
	onRunSelect: (runId: string) => void;
	onOpenWorkspace: () => void;
}

const ACTION_CONFIG: Record<
	RunAction,
	{ icon: React.ElementType; label: string; variant: "default" | "outline" | "ghost" }
> = {
	confirm: { icon: CheckIcon, label: "Confirm", variant: "default" },
	cancel: { icon: XIcon, label: "Cancel", variant: "outline" },
	retry: { icon: RefreshCcwIcon, label: "Retry", variant: "outline" },
	edit_draft: { icon: PencilIcon, label: "Edit", variant: "ghost" },
};

export function RunStatusCard({
	lineage,
	activeRunId,
	onRunSelect,
	onOpenWorkspace,
}: RunStatusCardProps) {
	const { confirm, cancel, retry, isActionPending } = useRunContext();
	const [isEditing, setIsEditing] = useState(false);

	const run = useMemo(
		() => lineage.runs.find((r) => r.id === activeRunId) ?? lineage.runs[lineage.runs.length - 1],
		[lineage.runs, activeRunId],
	);

	if (!run) return null;

	const actions = getAvailableActions(run.status) as readonly RunAction[];
	const isFailed = run.status === "failed";
	const isCancelled = run.status === "cancelled";
	const isSuccess = run.status === "success";
	const isActive = run.status === "dispatched" || run.status === "running";

	const handleAction = async (action: RunAction) => {
		switch (action) {
			case "confirm":
				await confirm(run.id, run.draftValue);
				break;
			case "cancel":
				await cancel(run.id);
				break;
			case "retry":
				await retry(run.id);
				break;
			case "edit_draft":
				setIsEditing(true);
				break;
		}
	};

	const handleDraftConfirm = async (value: string) => {
		await confirm(run.id, value);
		setIsEditing(false);
	};

	return (
		<div
			className={cn(
				"rounded-lg border bg-card/50 p-3 space-y-2.5",
				"text-sm transition-colors",
				isActive && "border-blue-200/60 dark:border-blue-500/20",
				isFailed && "border-red-200/40 dark:border-red-500/15",
				isCancelled && "border-zinc-200/60 dark:border-zinc-700/40",
				isSuccess && "border-emerald-200/60 dark:border-emerald-500/20",
			)}
		>
			{/* Header: status badge + timestamp */}
			<div className="flex items-center justify-between gap-2">
				<RunStatusBadge status={run.status} />
				{run.completedAt || run.cancelledAt ? (
					<span className="text-[10px] text-muted-foreground flex items-center gap-1">
						<ClockIcon className="size-2.5" />
						{format(
							new Date(run.completedAt ?? run.cancelledAt!),
							"HH:mm",
						)}
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

			{/* Cancellation info */}
			{isCancelled && run.cancelledAt && (
				<p className="text-xs text-muted-foreground">
					Cancelled at {format(new Date(run.cancelledAt), "HH:mm 'on' MMM dd")}
				</p>
			)}

			{/* Inline draft editor */}
			{isEditing && (
				<DraftEditor
					initialValue={run.draftValue}
					onConfirm={handleDraftConfirm}
					onCancel={() => setIsEditing(false)}
					isPending={isActionPending}
				/>
			)}

			{/* Action buttons + deep link */}
			{(actions.length > 0 || isSuccess) && !isEditing && (
				<div className="flex items-center gap-1.5 flex-wrap">
					{actions.map((action) => {
						const config = ACTION_CONFIG[action];
						const Icon = config.icon;
						return (
							<Button
								key={action}
								variant={config.variant}
								size="sm"
								className="h-7 px-2.5 text-xs gap-1"
								disabled={isActionPending}
								onClick={() => handleAction(action)}
							>
								<Icon className="size-3" />
								{config.label}
							</Button>
						);
					})}
					{isSuccess && (
						<Button
							variant="outline"
							size="sm"
							className="h-7 px-2.5 text-xs gap-1 border-emerald-200/60 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
							onClick={onOpenWorkspace}
						>
							<ExternalLinkIcon className="size-3" />
							View result
						</Button>
					)}
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
