import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { cn } from "@/lib/utils";
import React from "react";
import { Form, FormField } from "@/components/ui/form";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Usage } from "./usage";
import { useRouter } from "next/navigation";

const createLatencyTrace = () =>
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const logLatency = (
	traceId: string,
	step: string,
	startTime: number,
	details?: Record<string, unknown>,
) => {
	console.log("[chat-latency]", {
		traceId,
		step,
		elapsedMs: Math.round(performance.now() - startTime),
		...details,
	});
};

interface Props {
	projectId: string;
	onSendStart?: () => void;
	onChatStreamStart?: () => void;
	onChatStreamToken?: (token: string) => void;
	onChatStreamEnd?: () => void;
	onChatStreamError?: (message: string) => void;
}

const formSchema = z.object({
	// <- this is a zod schema that defines the shape of our form data and includes validation rules
	value: z
		.string()
		.min(1, { message: "Message cannot be empty." })
		.max(10000, "Prompt is too long"),
});

/**
 * Renders the message composer and streams chat responses back into the UI.
 * @param {Props} props - The message form props.
 * @returns {JSX.Element} The rendered message composer.
 */
export const MessageForm = ({
	projectId,
	onSendStart,
	onChatStreamStart,
	onChatStreamToken,
	onChatStreamEnd,
	onChatStreamError,
}: Props) => {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const router = useRouter();
	const submissionTraceRef = React.useRef<{
		traceId: string;
		startTime: number;
	} | null>(null);

	const { data: usage } = useQuery(trpc.usage.status.queryOptions());

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			value: "",
		},
	});

	const confirmRun = useMutation(trpc.routing.confirmRun.mutationOptions());

	const createMessage = useMutation(
		trpc.messages.create.mutationOptions({
			onSuccess: async (message, variables) => {
				const trace = submissionTraceRef.current;

				if (trace) {
					logLatency(trace.traceId, "createMessage.success", trace.startTime, {
						routingDecision: message.routing.decision,
					});
					logLatency(
						trace.traceId,
						"messages.invalidate.start",
						trace.startTime,
					);
				}

				form.reset();
				await queryClient.invalidateQueries(
					trpc.messages.getMany.queryOptions({ projectId }),
				);

				if (trace) {
					logLatency(trace.traceId, "messages.invalidate.end", trace.startTime);
				}

				queryClient.invalidateQueries(trpc.usage.status.queryOptions());

				if (message.routing.decision !== "chat") {
					if (!message.pendingRunId) {
						toast.error("Unable to start build.");
						return;
					}

					try {
						if (trace) {
							logLatency(
								trace.traceId,
								"confirmRun.start",
								trace.startTime,
								{ pendingRunId: message.pendingRunId },
							);
						}

						await confirmRun.mutateAsync({
							pendingRunId: message.pendingRunId,
							draftValue: variables.value,
						});

						if (trace) {
							logLatency(trace.traceId, "confirmRun.end", trace.startTime);
							logLatency(
								trace.traceId,
								"messages.invalidate.afterConfirm.start",
								trace.startTime,
							);
						}

						await queryClient.invalidateQueries(
							trpc.messages.getMany.queryOptions({ projectId }),
						);

						if (trace) {
							logLatency(
								trace.traceId,
								"messages.invalidate.afterConfirm.end",
								trace.startTime,
							);
						}
					} catch (error) {
						const errorMessage =
							error instanceof Error
								? error.message
								: "Unable to start build.";

						if (trace) {
							logLatency(trace.traceId, "confirmRun.error", trace.startTime, {
								message: errorMessage,
							});
						}

						toast.error(errorMessage);
					}

					return;
				}

				try {
					await streamChatResponse(variables.value, trace);
				} catch (error) {
					const errorMessage =
						error instanceof Error
							? error.message
							: "Something went wrong. Please try again.";

					if (trace) {
						logLatency(trace.traceId, "stream.error", trace.startTime, {
							message: errorMessage,
						});
					}

					onChatStreamError?.(errorMessage);
					toast.error(errorMessage);
				}
			},
			onError: (error) => {
				const trace = submissionTraceRef.current;

				if (trace) {
					logLatency(trace.traceId, "createMessage.error", trace.startTime, {
						code: error.data?.code,
						message: error.message,
					});
				}

				toast.error(error.message);

				if (error.data?.code === "TOO_MANY_REQUESTS") {
					router.push("/pricing");
				}
			},
		}),
	);

	/**
	 * Starts the chat stream and forwards incoming tokens to the parent.
	 * @param {string} value - The submitted user prompt.
	 * @returns {Promise<void>} A promise that resolves when streaming ends.
	 */
	const streamChatResponse = async (
		value: string,
		trace: { traceId: string; startTime: number } | null,
	) => {
		onChatStreamStart?.();

		if (trace) {
			logLatency(trace.traceId, "stream.start", trace.startTime);
			logLatency(trace.traceId, "chat.fetch.start", trace.startTime);
		}

		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				value,
				projectId,
				debugTraceId: trace?.traceId,
			}),
		});

		if (trace) {
			logLatency(trace.traceId, "chat.fetch.response", trace.startTime, {
				ok: response.ok,
				status: response.status,
			});
		}

		if (!response.ok || !response.body) {
			throw new Error("Unable to start chat response.");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let firstChunkLogged = false;
		let firstTokenLogged = false;

		while (true) {
			const { value: chunk, done } = await reader.read();

			if (done) {
				if (trace) {
					logLatency(trace.traceId, "stream.reader.done", trace.startTime);
				}
				break;
			}

			if (trace && !firstChunkLogged) {
				firstChunkLogged = true;
				logLatency(trace.traceId, "stream.firstChunk", trace.startTime, {
					bytes: chunk.length,
				});
			}

			buffer += decoder.decode(chunk, { stream: true });
			const events = buffer.split("\n\n");
			buffer = events.pop() ?? "";

			for (const event of events) {
				const lines = event.split("\n");
				const eventName =
					lines
						.find((line) => line.startsWith("event: "))
						?.slice("event: ".length) ?? "message";
				const data = lines
					.find((line) => line.startsWith("data: "))
					?.slice("data: ".length);

				if (!data) {
					continue;
				}

				if (data === "[DONE]") {
					if (trace) {
						logLatency(trace.traceId, "stream.done", trace.startTime);
						logLatency(
							trace.traceId,
							"messages.invalidate.afterStream.start",
							trace.startTime,
						);
					}

					await queryClient.invalidateQueries(
						trpc.messages.getMany.queryOptions({ projectId }),
					);

					if (trace) {
						logLatency(
							trace.traceId,
							"messages.invalidate.afterStream.end",
							trace.startTime,
						);
					}

					onChatStreamEnd?.();
					return;
				}

				const parsed = JSON.parse(data) as { token?: string; error?: string };

				if (eventName === "error") {
					onChatStreamError?.(
						parsed.error ?? "Something went wrong. Please try again.",
					);
					continue;
				}

				if (parsed.token) {
					if (trace && !firstTokenLogged) {
						firstTokenLogged = true;
						logLatency(trace.traceId, "stream.firstToken", trace.startTime, {
							length: parsed.token.length,
						});
					}

					onChatStreamToken?.(parsed.token);
				}
			}
		}
	};

	/**
	 * Submits the current form value to the server.
	 * @param {z.infer<typeof formSchema>} values - The validated form values.
	 * @returns {void} This handler submits the message mutation.
	 */
	const onSubmit = (values: z.infer<typeof formSchema>) => {
		const trace = {
			traceId: createLatencyTrace(),
			startTime: performance.now(),
		};

		submissionTraceRef.current = trace;
		onSendStart?.();
		logLatency(trace.traceId, "submit", trace.startTime, {
			projectId,
			messageLength: values.value.length,
		});
		logLatency(trace.traceId, "createMessage.start", trace.startTime);
		createMessage.mutate({
			value: values.value,
			projectId,
			debugTraceId: trace.traceId,
		});
	};

	const LOW_CREDITS_THRESHOLD = 4;

	const [isFocused, setIsFocused] = React.useState(false);
	const showUsage = !!usage && usage.remainingPoints <= LOW_CREDITS_THRESHOLD;
	const isPending = createMessage.isPending || confirmRun.isPending;
	const isButtonDisabled = isPending || !form.formState.isValid;

	return (
		<Form {...form}>
			{showUsage && (
				<Usage
					points={usage.remainingPoints}
					msBeforeNext={usage.msBeforeNext}
				/>
			)}
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className={cn(
					"relative border p-4 pt-1 rounded-xl bg-sidebar dark:bg-sidebar transition-all",
					isFocused && "shadow-xs",
					showUsage && "rounded-t-none",
				)}
			>
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
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									form.handleSubmit(onSubmit)(e);
								}
							}}
						/>
					)}
				/>
				<div className="flex gap-x-2 items-end justify-between pt-2">
					<div className="text-[10px] text-muted-foreground font-mono">
						<kbd
							className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1
                        rounded-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
						>
							Enter
						</kbd>
						&nbsp;to submit
					</div>
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
				</div>
			</form>
		</Form>
	);
};
