import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "../audit";
import type { RoutingDecision } from "../types";

interface CreateAndDispatchBuildRunInput {
	projectId: string;
	messageId?: string | null;
	value: string;
	actor: string;
	decision: RoutingDecision;
}

export async function createAndDispatchBuildRun({
	projectId,
	messageId,
	value,
	actor,
	decision,
}: CreateAndDispatchBuildRunInput) {
	const dispatchedAt = new Date();
	const run = await prisma.run.create({
		data: {
			status: "dispatched",
			draftValue: value,
			projectId,
			messageId,
			dispatchedAt,
		},
	});

	await logAuditEvent(prisma, {
		runId: run.id,
		action: "create",
		actor,
		payload: { decision },
	});

	await inngest.send({
		name: "code-agent/run",
		data: {
			value: run.draftValue,
			projectId: run.projectId,
			runId: run.id,
		},
	});

	await logAuditEvent(prisma, {
		runId: run.id,
		action: "dispatch",
		actor,
		payload: {
			projectId: run.projectId,
		},
	});

	return run;
}
