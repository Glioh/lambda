-- Archive legacy gated/cancelled runs before removing obsolete statuses.
UPDATE "Run"
SET
  "status" = 'failed',
  "completedAt" = COALESCE("completedAt", NOW()),
  "errorSummary" = COALESCE("errorSummary", 'Run archived during build confirmation workflow removal.'),
  "failureCategory" = COALESCE("failureCategory", 'validation')
WHERE "status" IN ('waiting_confirmation', 'confirmed', 'cancelled');

ALTER TABLE "Run" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "RunStatus_new" AS ENUM ('dispatched', 'running', 'success', 'failed');

ALTER TABLE "Run"
  ALTER COLUMN "status" TYPE "RunStatus_new"
  USING ("status"::text::"RunStatus_new");

ALTER TYPE "RunStatus" RENAME TO "RunStatus_old";
ALTER TYPE "RunStatus_new" RENAME TO "RunStatus";
DROP TYPE "RunStatus_old";

ALTER TABLE "Run" ALTER COLUMN "status" SET DEFAULT 'dispatched';

ALTER TABLE "Run" DROP CONSTRAINT IF EXISTS "Run_retriedFromRunId_fkey";
ALTER TABLE "Run" DROP COLUMN IF EXISTS "cancelledAt";
ALTER TABLE "Run" DROP COLUMN IF EXISTS "retriedFromRunId";
