-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('tool_error', 'timeout', 'infra', 'validation');

-- AlterTable
ALTER TABLE "Run" ADD COLUMN "failureCategory" "FailureCategory",
ADD COLUMN "retriedFromRunId" TEXT;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_retriedFromRunId_fkey" FOREIGN KEY ("retriedFromRunId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
