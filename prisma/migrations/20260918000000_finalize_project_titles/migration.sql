BEGIN;

-- Preserve every existing title and keep it editable.
ALTER TABLE "Project" ADD COLUMN "titleFinalized" BOOLEAN NOT NULL DEFAULT true;

-- New projects keep their derived title until the automatic attempt completes.
ALTER TABLE "Project" ALTER COLUMN "titleFinalized" SET DEFAULT false;
ALTER TABLE "Project" DROP COLUMN "titleGeneratedAt";

COMMIT;
