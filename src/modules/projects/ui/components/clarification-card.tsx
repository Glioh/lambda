import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

interface ClarificationCardProps {
	pendingRun: {
		id: string;
		clarificationPrompt: string | null;
		status: string;
	};
	onClarified: () => void;
	onCancelled: () => void;
}

/**
 * Renders a clarification response form for a pending run.
 * @param {ClarificationCardProps} props - The clarification card props.
 * @returns {JSX.Element} The rendered clarification card.
 */
export const ClarificationCard = ({
	pendingRun,
	onClarified,
	onCancelled,
}: ClarificationCardProps) => {
	const trpc = useTRPC();
	const [draftValue, setDraftValue] = useState("");

	const requestClarification = useMutation(
		trpc.routing.requestClarification.mutationOptions({
			onSuccess: () => {
				onClarified();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const cancelRun = useMutation(
		trpc.routing.cancelRun.mutationOptions({
			onSuccess: () => {
				onCancelled();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const isPending = requestClarification.isPending || cancelRun.isPending;
	const prompt = pendingRun.clarificationPrompt ?? "Clarification requested.";

	return (
		<div className="px-2 pb-4 pl-10">
			<Card
				className={cn(
					"gap-4 rounded-lg border bg-muted/40 py-4 shadow-none",
					pendingRun.status === "clarification_required" &&
						"border-primary/30",
				)}
			>
				<CardHeader className="gap-2 px-4">
					<CardTitle className="text-sm font-medium">
						Clarification needed
					</CardTitle>
					<p className="text-sm text-muted-foreground whitespace-pre-wrap">
						{prompt}
					</p>
				</CardHeader>
				<CardContent className="px-4">
					<Textarea
						value={draftValue}
						onChange={(event) => setDraftValue(event.target.value)}
						disabled={isPending}
						placeholder="Type your clarification..."
						className="min-h-24 resize-none bg-background"
					/>
				</CardContent>
				<CardFooter className="justify-end gap-2 px-4">
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={() =>
							cancelRun.mutate({
								pendingRunId: pendingRun.id,
							})
						}
					>
						{cancelRun.isPending ? "Cancelling..." : "Cancel"}
					</Button>
					<Button
						type="button"
						disabled={isPending}
						onClick={() =>
							requestClarification.mutate({
								pendingRunId: pendingRun.id,
								draftValue,
								clarificationPrompt: prompt,
							})
						}
					>
						{requestClarification.isPending ? "Submitting..." : "Submit"}
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
};
