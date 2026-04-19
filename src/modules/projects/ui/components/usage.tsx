import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { formatDuration, intervalToDuration } from "date-fns";
import { CrownIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Props {
	points: number;
	msBeforeNext: number;
}

export const Usage = ({ points, msBeforeNext }: Props) => {
	const { has } = useAuth();
	const hasProAccess = has?.({ plan: "pro" });
	const creditLabel = points === 1 ? "message" : "messages";
	const tierLabel = hasProAccess ? "" : "free ";
	const [remainingMs, setRemainingMs] = useState(0);

	useEffect(() => {
		const safeMsBeforeNext = Number.isFinite(msBeforeNext)
			? Math.max(0, msBeforeNext)
			: 0;
		const resetAt = Date.now() + safeMsBeforeNext;

		const updateRemaining = () => {
			setRemainingMs(Math.max(0, resetAt - Date.now()));
		};

		updateRemaining();
		const interval = setInterval(updateRemaining, 60_000);

		return () => clearInterval(interval);
	}, [msBeforeNext]);

	const resetTime = useMemo(() => {
		try {
			const formatted = formatDuration(
				intervalToDuration({
					start: 0,
					end: remainingMs,
				}),
				{ format: ["months", "days", "hours", "minutes"] },
			);

			return formatted || "< 1 minute";
		} catch (error) {
			console.error("Error formatting duration", error);
			return "unknown";
		}
	}, [remainingMs]);

	return (
		<div className="rounded-t-xl bg-background border border-b-0 p-2.5">
			<div className="flex items-center gap-x-2">
				<div>
					<p className="text-sm">
						{points} {tierLabel}
						{creditLabel} remaining
					</p>
					<p className="text-xs text-muted-foreground">Resets in {resetTime}</p>
				</div>
				{!hasProAccess && (
					<Button asChild size="sm" variant="tertiary" className="ml-auto">
						<Link href="/pricing">
							<CrownIcon /> Upgrade
						</Link>
					</Button>
				)}
			</div>
		</div>
	);
};
