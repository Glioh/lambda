-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- Step 1: Add projectId as nullable
ALTER TABLE "Message" ADD COLUMN "projectId" TEXT;

-- Step 2: Backfill existing rows with a default project
INSERT INTO "Project" ("id", "name", "createdAt", "updatedAt")
SELECT 'default-project', 'Default Project', NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM "Message" WHERE "projectId" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "Project" WHERE "id" = 'default-project');

UPDATE "Message" SET "projectId" = 'default-project' WHERE "projectId" IS NULL;

-- Step 3: Set the column to NOT NULL
ALTER TABLE "Message" ALTER COLUMN "projectId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
