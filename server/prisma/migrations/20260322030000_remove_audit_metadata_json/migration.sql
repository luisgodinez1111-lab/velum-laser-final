-- Consolidate AuditLog: copy metadataJson → metadata where metadata is NULL, then drop metadataJson
UPDATE "AuditLog" SET "metadata" = "metadataJson" WHERE "metadata" IS NULL AND "metadataJson" IS NOT NULL;
ALTER TABLE "AuditLog" DROP COLUMN IF EXISTS "metadataJson";
