-- Drop the build feature: sandbox fragments and the build routing pipeline.

DROP TABLE IF EXISTS "RoutingAuditLog";
DROP TABLE IF EXISTS "PendingRun";
DROP TABLE IF EXISTS "Fragment";

DROP TYPE IF EXISTS "PendingRunStatus";
