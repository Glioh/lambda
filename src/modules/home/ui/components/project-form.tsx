"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { cn } from "@/lib/utils";
import React from "react";
import { Form, FormField } from "@/components/ui/form";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useAttachments } from "@/modules/attachments/hooks/use-attachments";
import { AttachmentButton } from "@/modules/attachments/ui/components/attachment-button";
import { AttachmentStrip } from "@/modules/attachments/ui/components/attachment-strip";

const formSchema = z.object({
	// <- this is a zod schema that defines the shape of our form data and includes validation rules
	// No min(1): an image with no caption is enough to start a chat. Submit is
	// gated on "text OR attachments" below instead.
	value: z.string().max(10000, "Prompt is too long"),
});

export const ProjectForm = () => {
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const {
		attachments,
		isPreparing,
		addFiles,
		removeAt,
		toInput: attachmentsToInput,
	} = useAttachments();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			value: "",
		},
	});

	// useWatch rather than form.watch(): a real hook subscription, which keeps
	// the component memoizable instead of opting it out of the compiler.
	const watchedValue = useWatch({ control: form.control, name: "value" });

	const createProject = useMutation(
		trpc.projects.create.mutationOptions({
			onSuccess: (data) => {
				queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());

				router.push(`/projects/${data.id}`);
				queryClient.invalidateQueries(trpc.usage.status.queryOptions());
			},
			onError: (error) => {
				toast.error(error.message);

				if (error.data?.code === "UNAUTHORIZED") {
					router.push("/sign-in");
					return;
				}

				if (error.data?.code === "TOO_MANY_REQUESTS") {
					router.push("/pricing");
				}
			},
		}),
	);

	const onSubmit = (values: z.infer<typeof formSchema>) => {
		const pendingAttachments = attachmentsToInput();

		createProject.mutate({
			value: values.value,
			...(pendingAttachments.length > 0
				? { attachments: pendingAttachments }
				: {}),
		});
	};

	const [isFocused, setIsFocused] = React.useState(false);
	const isPending = createProject.isPending;
	const hasText = (watchedValue ?? "").trim().length > 0;
	const isButtonDisabled =
		isPending ||
		isPreparing ||
		!form.formState.isValid ||
		(!hasText && attachments.length === 0);

	return (
		<Form {...form}>
			<section className="space-y-6">
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className={cn(
						"relative border p-4 pt-1 rounded-xl bg-sidebar dark:bg-sidebar transition-all",
						isFocused && "shadow-xs",
					)}
					onDragOver={(event) => event.preventDefault()}
					onDrop={(event) => {
						// Ignore drops once the chat is being created — the files would
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
									Enter
								</kbd>
								&nbsp;to submit
							</div>
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
			</section>
		</Form>
	);
};
