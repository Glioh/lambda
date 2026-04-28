import { z } from "zod";

export const modeSchema = z.enum(["chat", "build"]);

export const routingInputSchema = z
	.object({
		mode: modeSchema.optional(),
		draftForExecution: z.string().optional(),
	})
	.optional();

export const routingDecisionSchema = z.object({
	decision: modeSchema,
	decisionSource: z.enum(["auto", "explicit"]),
	confidence: z.enum(["high", "medium", "low"]),
	requiresConfirmation: z.boolean(),
});

export const submitInputSchema = z.object({
	value: z.string().min(1),
	projectId: z.string().min(1),
	routing: routingInputSchema,
});
