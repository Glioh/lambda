import { gemini, createAgent } from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import { getSandbox } from "./utils";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {

    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("lambda")
      return sandbox.sandboxId;
    });

    const codeAgent = createAgent({
      name: 'code-agent',
      description: 'Expert NextJS developer for code generation tasks.',
      system:
        'You are an expert NextJS developer. ' +
        'You write clean, efficient, and well-documented code. ',
      model: gemini({
        model: 'gemini-2.5-flash',
        defaultParameters: {
        },
      }),
    });

    const { output } = await codeAgent.run(
      `Write the following snippet: ${event.data.value}`
    )

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    });

    return { output, sandboxUrl };
  },
);