-- AlterEnum
ALTER TYPE "PendingRunStatus" ADD VALUE 'running';
ALTER TYPE "PendingRunStatus" ADD VALUE 'success';
ALTER TYPE "PendingRunStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "PendingRun"
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "errorSummary" TEXT;
