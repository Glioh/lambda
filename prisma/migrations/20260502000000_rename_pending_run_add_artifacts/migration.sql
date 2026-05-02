-- Rename enum
ALTER TYPE "PendingRunStatus" RENAME TO "RunStatus";

-- Rename table
ALTER TABLE "PendingRun" RENAME TO "Run";

-- Rename primary key constraint
ALTER INDEX "PendingRun_pkey" RENAME TO "Run_pkey";

-- Rename FK column in RoutingAuditLog
ALTER TABLE "RoutingAuditLog" RENAME COLUMN "pendingRunId" TO "runId";

-- Rename FK constraints
ALTER TABLE "Run" RENAME CONSTRAINT "PendingRun_projectId_fkey" TO "Run_projectId_fkey";
ALTER TABLE "Run" RENAME CONSTRAINT "PendingRun_messageId_fkey" TO "Run_messageId_fkey";
ALTER TABLE "RoutingAuditLog" RENAME CONSTRAINT "RoutingAuditLog_pendingRunId_fkey" TO "RoutingAuditLog_runId_fkey";

-- Add indexes on Run
CREATE INDEX "Run_projectId_status_idx" ON "Run"("projectId", "status");
CREATE INDEX "Run_projectId_createdAt_idx" ON "Run"("projectId", "createdAt");

-- CreateTable: Artifact
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Artifact_projectId_key" ON "Artifact"("projectId");

-- CreateTable: ArtifactVersion
CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "artifactId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sandboxUrl" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArtifactVersion_artifactId_version_key" ON "ArtifactVersion"("artifactId", "version");
CREATE INDEX "ArtifactVersion_artifactId_createdAt_idx" ON "ArtifactVersion"("artifactId", "createdAt");

-- CreateTable: ArtifactFile
CREATE TABLE "ArtifactFile" (
    "id" TEXT NOT NULL,
    "artifactVersionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "ArtifactFile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArtifactFile_artifactVersionId_path_key" ON "ArtifactFile"("artifactVersionId", "path");

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactFile" ADD CONSTRAINT "ArtifactFile_artifactVersionId_fkey" FOREIGN KEY ("artifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
