"use client";

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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PROJECT_TEMPLATES } from "../../constants";

const formSchema = z.object({
	// <- this is a zod schema that defines the shape of our form data and includes validation rules
	value: z
		.string()
		.min(1, { message: "Message cannot be empty." })
		.max(10000, "Prompt is too long"),
});

export const ProjectForm = () => {
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			value: "",
		},
	});

	const confirmRun = useMutation(trpc.routing.confirmRun.mutationOptions());

	const createProject = useMutation(
		trpc.projects.create.mutationOptions({
			onSuccess: async (data) => {
				queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());

				if (data.routing.decision !== "chat") {
					// Build path: confirm the run to dispatch the Inngest job
					if (data.runId) {
						try {
							await confirmRun.mutateAsync({
								runId: data.runId,
							});
						} catch (error) {
							const errorMessage =
								error instanceof Error
									? error.message
									: "Unable to start build.";
							toast.error(errorMessage);
						}
					}
				}

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
		createProject.mutate({
			value: values.value,
		});
	};

	const onSelect = (content: string) => {
		form.setValue("value", content, {
			shouldDirty: true,
			shouldTouch: true,
			shouldValidate: true,
		});
	};

	const [isFocused, setIsFocused] = React.useState(false);
	const isPending = createProject.isPending || confirmRun.isPending;
	const isButtonDisabled = isPending || !form.formState.isValid;

	return (
		<Form {...form}>
			<section className="space-y-6">
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className={cn(
						"relative border p-4 pt-1 rounded-xl bg-sidebar dark:bg-sidebar transition-all",
						isFocused && "shadow-xs",
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
				<div className="flex-wrap justify-center gap-2 hidden md:flex max-w-3xl">
					{PROJECT_TEMPLATES.map((template) => (
						<Button
							key={template.title}
							variant="outline"
							size="sm"
							className="bg-white dark:bg-sidebar"
							onClick={() => {
								onSelect(template.prompt);
							}}
						>
							{template.emoji} {template.title}
						</Button>
					))}
				</div>
			</section>
		</Form>
	);
};
