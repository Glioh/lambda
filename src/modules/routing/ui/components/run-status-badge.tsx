"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RunStatus } from "@prisma/client";
import { CheckCircle2Icon, XCircleIcon, Loader2Icon } from "lucide-react";

const STATUS_CONFIG: Record<
	RunStatus,
	{ label: string; className: string; icon: React.ElementType; pulse?: boolean }
> = {
	dispatched: {
		label: "Building",
		className:
			"border-blue-300/60 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-400",
		icon: Loader2Icon,
		pulse: true,
	},
	running: {
		label: "Running",
		className:
			"border-blue-300/60 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-400",
		icon: Loader2Icon,
		pulse: true,
	},
	success: {
		label: "Complete",
		className:
			"border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-400",
		icon: CheckCircle2Icon,
	},
	failed: {
		label: "Failed",
		className:
			"border-red-300/60 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-400",
		icon: XCircleIcon,
	},
};

interface RunStatusBadgeProps {
	status: RunStatus;
	className?: string;
}

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
	const config = STATUS_CONFIG[status];
	const Icon = config.icon;

	return (
		<Badge
			variant="outline"
			className={cn(
				"gap-1.5 text-[11px] font-medium tracking-tight py-0.5 px-2",
				config.className,
				className,
			)}
		>
			<Icon
				className={cn("size-3", config.pulse && "animate-spin")}
			/>
			{config.label}
		</Badge>
	);
}

export { STATUS_CONFIG };
