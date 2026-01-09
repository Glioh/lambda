import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    // Imagine this is a download step that takes some time
    await step.sleep("wait-a-moment", "30s");

    // Imagine this is a transcript step 
    await step.sleep("wait-a-moment", "30s");

    // Imagine this is a summary step
    await step.sleep("wait-a-moment", "30s");

    return { message: `Hello ${event.data.email}!` };
  },
);