import {
	openai,
	createAgent,
	createTool,
	createNetwork,
	Tool,
	type Message,
	createState,
} from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import {
	getSandbox,
	lastAssistantTextMessageContent,
	parseAgentOutput,
} from "./utils";
import z from "zod";
import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";
import { SANDBOX_TIMEOUT } from "./types";
import { transition } from "@/modules/routing/state";
import { logAuditEvent } from "@/modules/routing/audit";

interface AgentState {
	summary: string;
	files: { [path: string]: string };
}

function getErrorSummary(error: unknown): string {
	if (error instanceof Error) {
		return error.message.slice(0, 500);
	}

	return String(error).slice(0, 500);
}

export const codeAgentFunction = inngest.createFunction(
	{ id: "code-agent", triggers: [{ event: "code-agent/run" }] },
	async ({ event, step }) => {
		try {
			if (event.data.runId) {
				const runningRun = await step.run("mark-run-running", async () => {
					const updated = await transition(
						prisma,
						event.data.runId,
						"dispatched",
						"running",
						{
							startedAt: new Date(),
						},
					);

					if (updated) {
						await logAuditEvent(prisma, {
							runId: event.data.runId,
							action: "start",
							actor: "system",
						});
					}

					return updated;
				});

				if (!runningRun) {
					return;
				}
			}

		const sandboxId = await step.run("get-sandbox-id", async () => {
			const sandbox = await Sandbox.create("lambda");
			await sandbox.setTimeout(SANDBOX_TIMEOUT);
			return sandbox.sandboxId;
		});

		const previousMessages = await step.run(
			"get-previous-messages",
			async () => {
				const formattedMessages: Message[] = [];

				const messages = await prisma.message.findMany({
					where: {
						projectId: event.data.projectId,
					},
					orderBy: {
						createdAt: "desc",
					},
					take: 5,
				});

				for (const message of messages) {
					formattedMessages.push({
						type: "text",
						role: message.role === "ASSISTANT" ? "assistant" : "user",
						content: message.content,
					});
				}

				return formattedMessages.reverse(); // Reverse to have the most recent messages first
			},
		);

		const state = createState<AgentState>(
			{
				summary: "",
				files: {},
			},
			{
				messages: previousMessages,
			},
		);

		const codeAgent = createAgent<AgentState>({
			name: "code-agent",
			description: "An expert coding agent",
			system: PROMPT,
			model: openai({
				model: "gpt-5-mini",
				defaultParameters: {},
			}),
			tools: [
				createTool({
					name: "terminal",
					description: "Use the terminal to run commands",
					parameters: z.object({
						command: z.string(),
					}),
					handler: async ({ command }, { step }) => {
						if (!step) {
							throw new Error("Step context is required for terminal tool");
						}
						return await step.run("terminal", async () => {
							const buffers = { stdout: "", stderr: "" };

							try {
								const sandbox = await getSandbox(sandboxId);
								const result = await sandbox.commands.run(command, {
									// Incrementally adds output/errors to the buffer var as they received
									onStdout: (data: string) => {
										buffers.stdout += data;
									},
									onStderr: (data: string) => {
										buffers.stderr += data;
									},
								});
								return result.stdout;
							} catch (e) {
								console.error(
									`Command failed: ${e} \nstdout:: ${buffers.stdout}\nstderr: ${buffers.stderr}`,
								);
								return `Command failed: ${e} \nstdout:: ${buffers.stdout}\nstderr: ${buffers.stderr}`;
							}
						});
					},
				}),

				createTool({
					name: "createOrUpdateFiles",
					description: "Create or update files in the sandbox",
					parameters: z.object({
						files: z.array(
							z.object({
								path: z.string(),
								content: z.string(),
							}),
						),
					}),
					handler: async (
						{ files },
						{ step, network }: Tool.Options<AgentState>,
					) => {
						const newFiles = await step?.run(
							"createOrUpdateFiles",
							async () => {
								try {
									const updatedFiles = network.state.data.files || {};
									const sandbox = await getSandbox(sandboxId);
									for (const file of files) {
										await sandbox.files.write(file.path, file.content);
										updatedFiles[file.path] = file.content;
									}

									return updatedFiles;
								} catch (e) {
									return "Error: " + e;
								}
							},
						);

						if (typeof newFiles === "object") {
							network.state.data.files = newFiles;
						}
					},
				}),

				createTool({
					name: "readFiles",
					description: "Read files from the sandbox",
					parameters: z.object({
						files: z.array(z.string()),
					}),
					handler: async ({ files }, { step }) => {
						return await step?.run("readFiles", async () => {
							try {
								const sandbox = await getSandbox(sandboxId);
								const contents = [];
								for (const file of files) {
									const content = await sandbox.files.read(file);
									contents.push({ path: file, content });
								}
								return JSON.stringify(contents);
							} catch (e) {
								return "Error: " + e;
							}
						});
					},
				}),
			],
			lifecycle: {
				onResponse: async ({ result, network }) => {
					const lastAssistantMessageText =
						lastAssistantTextMessageContent(result);

					if (lastAssistantMessageText && network) {
						if (lastAssistantMessageText?.includes("<task_summary>")) {
							network.state.data.summary = lastAssistantMessageText;
						}
					}
					return result;
				},
			},
		});

		const network = createNetwork<AgentState>({
			name: "coding-agent-network",
			agents: [codeAgent],
			maxIter: 15,
			defaultState: state,
			router: async ({ network }) => {
				const summary = network.state.data.summary;

				if (summary) {
					return;
				}

				return codeAgent;
			},
		});

		const result = await network.run(event.data.value, { state });

		const fragmentTitleGenerator = createAgent({
			name: "fragment-title-generator",
			description:
				"Generates a title for a code fragment based on the task summary",
			system: FRAGMENT_TITLE_PROMPT,
			model: openai({
				model: "gpt-5-mini",
				defaultParameters: {},
			}),
		});

		const responseGenerator = createAgent({
			name: "response-generator",
			description: "Generates a response based on the task summary",
			system: RESPONSE_PROMPT,
			model: openai({
				model: "gpt-5-mini",
				defaultParameters: {},
			}),
		});

		const { output: fragmentTitleOutput } = await fragmentTitleGenerator.run(
			result.state.data.summary,
		);
		const { output: responseOutput } = await responseGenerator.run(
			result.state.data.summary,
		);

		const isError =
			!result.state.data.summary ||
			Object.keys(result.state.data.files || {}).length === 0;

		const sandboxUrl = await step.run("get-sandbox-url", async () => {
			const sandbox = await getSandbox(sandboxId);
			const host = sandbox.getHost(3000);
			return `https://${host}`;
		});

		await step.run("save-result", async () => {
			if (isError) {
				return await prisma.message.create({
					data: {
						projectId: event.data.projectId,
						content: "Something went wrong. Please try again.",
						role: "ASSISTANT",
						type: "ERROR",
					},
				});
			}

			return await prisma.message.create({
				data: {
					projectId: event.data.projectId,
					content: parseAgentOutput(responseOutput),
					role: "ASSISTANT",
					type: "RESULT",
					fragment: {
						create: {
							sandboxUrl: sandboxUrl,
							title: parseAgentOutput(fragmentTitleOutput),
							files: result.state.data.files,
						},
					},
				},
			});
		});

		if (event.data.runId) {
			await step.run("mark-run-success", async () => {
				const updated = await transition(
					prisma,
					event.data.runId,
					"running",
					"success",
					{
						completedAt: new Date(),
					},
				);

				if (updated) {
					await logAuditEvent(prisma, {
						runId: event.data.runId,
						action: "success",
						actor: "system",
					});
				}

				return updated;
			});
		}

		return {
			url: sandboxUrl,
			title: parseAgentOutput(fragmentTitleOutput),
			files: result.state.data.files,
			summary: result.state.data.summary,
		};
		} catch (error) {
			if (event.data.runId) {
				const errorSummary = getErrorSummary(error);

				await step.run("mark-run-failed", async () => {
					const updated = await transition(
						prisma,
						event.data.runId,
						"running",
						"failed",
						{
							completedAt: new Date(),
							errorSummary,
						},
					);

					if (updated) {
						await logAuditEvent(prisma, {
							runId: event.data.runId,
							action: "fail",
							actor: "system",
							payload: {
								errorSummary,
							},
						});
					}

					return updated;
				});
			}

			throw error;
		}
	},
);
