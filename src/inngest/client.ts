import { Inngest } from "inngest";

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "lambda",
  isDev: process.env.NODE_ENV !== "production",
  checkpointing: {
    // Serverless (Vercel/Next.js): cap runtime per request to ~80% of platform max.
    maxRuntime: "50s",
  },
});