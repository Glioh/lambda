-- CreateEnum
CREATE TYPE "PendingRunStatus" AS ENUM ('clarification_required', 'waiting_confirmation', 'confirmed', 'dispatched', 'cancelled');

-- CreateTable
CREATE TABLE "PendingRun" (
    "id" TEXT NOT NULL,
    "status" "PendingRunStatus" NOT NULL DEFAULT 'waiting_confirmation',
    "draftValue" TEXT NOT NULL,
    "clarificationPrompt" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "messageId" TEXT,

    CONSTRAINT "PendingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingAuditLog" (
    "id" TEXT NOT NULL,
    "pendingRunId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingAuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PendingRun" ADD CONSTRAINT "PendingRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingRun" ADD CONSTRAINT "PendingRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingAuditLog" ADD CONSTRAINT "RoutingAuditLog_pendingRunId_fkey" FOREIGN KEY ("pendingRunId") REFERENCES "PendingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
