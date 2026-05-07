"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FAILURE_LABELS } from "@/modules/routing/ui-contracts";
import type { FailureCategory } from "@prisma/client";
import { AlertTriangleIcon } from "lucide-react";

interface RunErrorDisplayProps {
	failureCategory: FailureCategory;
	errorSummary: string | null;
	className?: string;
}

export function RunErrorDisplay({
	failureCategory,
	errorSummary,
	className,
}: RunErrorDisplayProps) {
	const label = FAILURE_LABELS[failureCategory];

	return (
		<div
			className={cn(
				"rounded-lg border border-red-200/60 bg-red-50/50 p-2.5",
				"dark:border-red-500/20 dark:bg-red-950/20",
				className,
			)}
		>
			<div className="flex items-start gap-2">
				<AlertTriangleIcon className="size-3.5 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
				<div className="flex flex-col gap-1 min-w-0">
					<Badge
						variant="outline"
						className="w-fit text-[10px] px-1.5 py-0 border-red-200/80 text-red-600 dark:border-red-500/30 dark:text-red-400"
					>
						{label}
					</Badge>
					{errorSummary && (
						<p className="text-xs text-red-600/80 dark:text-red-400/70 leading-relaxed break-words">
							{errorSummary}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
