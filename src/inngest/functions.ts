import { Agent, gemini, createAgent } from "@inngest/agent-kit";
import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {

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

    console.log(output);

    return { output };
  },
);