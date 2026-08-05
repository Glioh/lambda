import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { streamChatCompletion } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";
import React from "react";
import { Form, FormField } from "@/components/ui/form";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, Loader2Icon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Usage } from "./usage";
import { useRouter } from "next/navigation";
import { useAttachments } from "@/modules/attachments/hooks/use-attachments";
import { AttachmentButton } from "@/modules/attachments/ui/components/attachment-button";
import { AttachmentStrip } from "@/modules/attachments/ui/components/attachment-strip";

interface Props {
	projectId: string;
	/** True while a response is streaming; swaps submit for a stop button. */
	isStreaming?: boolean;
	onChatStreamStart?: () => void;
	onChatStreamStatus?: (status: string) => void;
	onChatStreamToken?: (token: string) => void;
	onChatStreamEnd?: () => void;
	onChatStreamError?: (message: string) => void;
	/** Called when the user stops generation, with whatever streamed so far. */
	onChatStreamStopped?: () => void;
	/**
	 * Also invoked on stop. The container owns a second stream (the one started
	 * automatically when you arrive with an unanswered message), and the stop
	 * button has to reach that one too. Whichever isn't running no-ops.
	 */
	onStopRequested?: () => void;
}

const formSchema = z.object({
	// <- this is a zod schema that defines the shape of our form data and includes validation rules
	// No min(1): an image with no caption is a complete message. Submit is gated
	// on "text OR attachments" below instead.
	value: z.string().max(10000, "Prompt is too long"),
});

/**
 * Renders the message composer and streams chat responses back into the UI.
 * @param {Props} props - The message form props.
 * @returns {JSX.Element} The rendered message composer.
 */
export const MessageForm = ({
	projectId,
	isStreaming,
	onChatStreamStart,
	onChatStreamStatus,
	onChatStreamToken,
	onChatStreamEnd,
	onChatStreamError,
	onChatStreamStopped,
	onStopRequested,
}: Props) => {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();
	const abortControllerRef = React.useRef<AbortController | null>(null);
	const {
		attachments,
		isPreparing,
		addFiles,
		removeAt,
		clear: clearAttachments,
		toInput: attachmentsToInput,
	} = useAttachments();

	/** Aborts the in-flight response; the server keeps whatever already streamed. */
	const stopStreaming = React.useCallback(() => {
		abortControllerRef.current?.abort();
		abortControllerRef.current = null;
		onStopRequested?.();
	}, [onStopRequested]);

	const { data: usage } = useQuery(trpc.usage.status.queryOptions());

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			value: "",
		},
	});

	// Callbacks are supplied per-call in `onSubmit` rather than here: this options
	// object is built during render, and a callback closing over the abort ref
	// would count as reading a ref during render.
	// useWatch rather than form.watch(): a real hook subscription, which keeps
	// the component memoizable instead of opting it out of the compiler.
	const watchedValue = useWatch({ control: form.control, name: "value" });

	const createMessage = useMutation(trpc.messages.create.mutationOptions());

	/**
	 * Starts the chat stream and forwards incoming tokens to the parent.
	 * @param {string} value - The submitted user prompt.
	 * @returns {Promise<void>} A promise that resolves when streaming ends.
	 */
	const streamChatResponse = async (value: string, hasAttachments: boolean) => {
		onChatStreamStart?.();

		const controller = new AbortController();
		abortControllerRef.current = controller;

		try {
			const { stopped } = await streamChatCompletion(
				{ value, projectId, hasAttachments },
				{
					onStatus: (status) => onChatStreamStatus?.(status),
					onToken: (token) => onChatStreamToken?.(token),
					onError: (message) =>
						onChatStreamError?.(
							message || "Something went wrong. Please try again.",
						),
				},
				{ signal: controller.signal },
			);

			// Report the stop BEFORE refetching. The refetch re-renders the thread
			// still ending on the user's message, which the container reads as
			// "unanswered" — it has to know a stop happened first, or it re-streams
			// the prompt the user just interrupted.
			if (stopped) {
				onChatStreamStopped?.();
				await queryClient.invalidateQueries(
					trpc.messages.getMany.queryOptions({ projectId }),
				);
				return;
			}

			await queryClient.invalidateQueries(
				trpc.messages.getMany.queryOptions({ projectId }),
			);

			onChatStreamEnd?.();
		} finally {
			// Only clear our own controller. A newer send may already have replaced
			// it, and blanking that one would leave its stop button inert.
			if (abortControllerRef.current === controller) {
				abortControllerRef.current = null;
			}
		}
	};

	/**
	 * Submits the current form value to the server.
	 * @param {z.infer<typeof formSchema>} values - The validated form values.
	 * @returns {void} This handler submits the message mutation.
	 */
	const onSubmit = (values: z.infer<typeof formSchema>) => {
		const pendingAttachments = attachmentsToInput();

		createMessage.mutate(
			{
				value: values.value,
				projectId,
				...(pendingAttachments.length > 0
					? { attachments: pendingAttachments }
					: {}),
			},
			{
				onSuccess: async (_message, variables) => {
					form.reset();
					clearAttachments();
					// Fire-and-forget for usage — not on critical path
					queryClient.invalidateQueries(trpc.usage.status.queryOptions());

					// Don't block stream on message list refresh
					// The poll interval will pick up the new message
					queryClient.invalidateQueries(
						trpc.messages.getMany.queryOptions({ projectId }),
					);

					// Activity bumps Project.updatedAt server-side, so refresh the
					// sidebar to float this chat back to the top of the list.
					queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());

					try {
						await streamChatResponse(
							variables.value,
							(variables.attachments?.length ?? 0) > 0,
						);
					} catch (error) {
						const errorMessage =
							error instanceof Error
								? error.message
								: "Something went wrong. Please try again.";

						onChatStreamError?.(errorMessage);
						toast.error(errorMessage);
					}
				},
				onError: (error) => {
					toast.error(error.message);

					if (error.data?.code === "TOO_MANY_REQUESTS") {
						router.push("/pricing");
					}
				},
			},
		);
	};

	const LOW_CREDITS_THRESHOLD = 4;

	const [isFocused, setIsFocused] = React.useState(false);
	const showUsage = !!usage && usage.remainingPoints <= LOW_CREDITS_THRESHOLD;
	const isPending = createMessage.isPending;
	const hasText = (watchedValue ?? "").trim().length > 0;
	// Text or images is enough — an uncaptioned screenshot is a real message.
	const isButtonDisabled =
		isPending ||
		isPreparing ||
		!form.formState.isValid ||
		(!hasText && attachments.length === 0);

	return (
		<Form {...form}>
			{showUsage && (
				<Usage
					points={usage.remainingPoints}
					msBeforeNext={usage.msBeforeNext}
				/>
			)}
			<form
				// Built inside the handler, not during render: handleSubmit(onSubmit)
				// at render time would invoke a closure that reaches the abort ref.
				onSubmit={(event) => form.handleSubmit(onSubmit)(event)}
				className={cn(
					"relative border p-4 pt-1 rounded-xl bg-sidebar dark:bg-sidebar transition-all",
					isFocused && "shadow-xs",
					showUsage && "rounded-t-none",
				)}
				onDragOver={(event) => event.preventDefault()}
				onDrop={(event) => {
					// Ignore drops once the message is being sent — the files would
					// never make it into the request that's already in flight.
					if (isPending || isPreparing) {
						return;
					}

					if (event.dataTransfer.files?.length) {
						event.preventDefault();
						addFiles(event.dataTransfer.files);
					}
				}}
			>
				<AttachmentStrip
					attachments={attachments}
					onRemove={removeAt}
					disabled={isPending}
				/>
				<FormField
					control={form.control}
					name="value"
					render={({ field }) => (
						<TextareaAutosize
							{...field}
							disabled={isPending}
							onFocus={() => setIsFocused(true)}
							onBlur={() => setIsFocused(false)}
							minRows={2}
							maxRows={8}
							className="pt-4 resize-none border-none w-full outline-none bg-transparent"
							placeholder="Type your message here..."
							onKeyDown={(e) => {
								if (e.key === "Escape" && isStreaming) {
									e.preventDefault();
									stopStreaming();
									return;
								}

								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();

									// Enter bypasses the disabled submit button, so it has to
									// re-check the same conditions — otherwise a blank or
									// still-preparing composer fires a doomed request.
									if (isButtonDisabled) {
										return;
									}

									form.handleSubmit(onSubmit)(e);
								}
							}}
						/>
					)}
				/>
				<div className="flex gap-x-2 items-center justify-between pt-2">
					<div className="flex items-center gap-1">
						<AttachmentButton
							onFiles={addFiles}
							disabled={isPending}
							isPreparing={isPreparing}
						/>
						<div className="text-[10px] text-muted-foreground font-mono">
							<kbd
								className="pointer-events-none inline-flex h-5 select-none items-center gap-1
                        rounded-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
							>
								{isStreaming ? "Esc" : "Enter"}
							</kbd>
							&nbsp;{isStreaming ? "to stop" : "to submit"}
						</div>
					</div>
					{isStreaming ? (
						<Button
							type="button"
							onClick={stopStreaming}
							aria-label="Stop generating"
							className="size-8 rounded-full"
						>
							<SquareIcon className="size-3 fill-current" />
						</Button>
					) : (
						<Button
							type="submit"
							disabled={isButtonDisabled}
							className={cn(
								"size-8 rounded-full",
								isButtonDisabled && "bg-muted-foreground border",
							)}
						>
							{isPending ? (
								<Loader2Icon className="size-4 animate-spin" />
							) : (
								<ArrowUpIcon />
							)}
						</Button>
					)}
				</div>
			</form>
		</Form>
	);
};
