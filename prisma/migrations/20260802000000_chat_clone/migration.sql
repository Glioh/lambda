-- Chat clone: image attachments, LLM-generated chat titles, and the indexes the
-- sidebar chat list and the chat route's history loads have been missing.

-- Base64 image payloads. `data` carries the base64 body only (no data: prefix).
-- Postgres TOASTs values over ~2kB out of line, so metadata-only selects never
-- read the payload — which is why every list query must avoid selecting "data".
CREATE TABLE "Attachment" (
    "id"        TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "data"      TEXT NOT NULL,
    "width"     INTEGER NOT NULL,
    "height"    INTEGER NOT NULL,
    "byteSize"  INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- LLM-generated chat titles. NULL means "Project"."name" is still the
-- random-word-slugs placeholder and the titler may overwrite it. A manual
-- rename also stamps this column, so the titler never clobbers a user's title.
ALTER TABLE "Project" ADD COLUMN "titleGeneratedAt" TIMESTAMP(3);

-- DEPLOYMENT NOTE: the three indexes below are built non-concurrently, which
-- takes an ACCESS EXCLUSIVE lock and blocks writes for the duration. That is
-- fine on a fresh database (the tables are empty), which is the only way this
-- migration has been applied. Against an existing populated database, create
-- them out of band with CREATE INDEX CONCURRENTLY first, then apply this
-- migration — Prisma runs migrations in a transaction, so CONCURRENTLY cannot
-- be used inside this file.

-- Sidebar chat list: WHERE "userId" = $1 ORDER BY "updatedAt" DESC.
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt" DESC);

-- Chat route history load and messages.getMany.
CREATE INDEX "Message_projectId_createdAt_idx" ON "Message"("projectId", "createdAt");

-- Chat route compaction-checkpoint lookup:
-- WHERE "projectId" = $1 AND "type" = 'SUMMARY' ORDER BY "createdAt" DESC LIMIT 1.
CREATE INDEX "Message_projectId_type_createdAt_idx" ON "Message"("projectId", "type", "createdAt");
