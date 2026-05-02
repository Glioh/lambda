-- Defensive: any stuck rows become cancelled (should be zero in practice)
UPDATE "PendingRun" SET "status" = 'cancelled' WHERE "status" = 'clarification_required';

-- Drop the clarificationPrompt column
ALTER TABLE "PendingRun" DROP COLUMN "clarificationPrompt";

-- Recreate enum without the clarification_required value
ALTER TYPE "PendingRunStatus" RENAME TO "PendingRunStatus_old";
CREATE TYPE "PendingRunStatus" AS ENUM ('waiting_confirmation', 'confirmed', 'dispatched', 'cancelled');
ALTER TABLE "PendingRun"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PendingRunStatus" USING "status"::text::"PendingRunStatus",
  ALTER COLUMN "status" SET DEFAULT 'waiting_confirmation';
DROP TYPE "PendingRunStatus_old";
