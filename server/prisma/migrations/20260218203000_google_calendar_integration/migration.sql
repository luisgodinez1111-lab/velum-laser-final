-- Google Calendar bidirectional integration + queue + tenant compatibility fields.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrationJobStatus') THEN
    CREATE TYPE "IntegrationJobStatus" AS ENUM ('pending', 'processing', 'done', 'failed');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS "User_clinicId_idx" ON "User"("clinicId");

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS "googleEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleCalendarId" TEXT,
  ADD COLUMN IF NOT EXISTS "syncStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastPushedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Appointment_clinicId_idx" ON "Appointment"("clinicId");
CREATE INDEX IF NOT EXISTS "Appointment_googleEventId_idx" ON "Appointment"("googleEventId");

CREATE TABLE IF NOT EXISTS "GoogleCalendarIntegration" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "accessTokenEnc" TEXT NOT NULL,
  "refreshTokenEnc" TEXT NOT NULL,
  "scope" TEXT,
  "tokenExpiry" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "watchChannelId" TEXT,
  "watchResourceId" TEXT,
  "watchExpiration" TIMESTAMP(3),
  "syncToken" TEXT,
  "lastSyncAt" TIMESTAMP(3),
  "eventFormatMode" TEXT NOT NULL DEFAULT 'complete',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleCalendarIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GoogleCalendarIntegration_clinicId_key"
  ON "GoogleCalendarIntegration"("clinicId");
CREATE INDEX IF NOT EXISTS "GoogleCalendarIntegration_isActive_idx"
  ON "GoogleCalendarIntegration"("isActive");
CREATE INDEX IF NOT EXISTS "GoogleCalendarIntegration_watchChannelId_idx"
  ON "GoogleCalendarIntegration"("watchChannelId");

CREATE TABLE IF NOT EXISTS "IntegrationJob" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "googleIntegrationId" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "IntegrationJobStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "lockedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntegrationJob_status_runAt_idx"
  ON "IntegrationJob"("status", "runAt");
CREATE INDEX IF NOT EXISTS "IntegrationJob_clinicId_status_runAt_idx"
  ON "IntegrationJob"("clinicId", "status", "runAt");
CREATE INDEX IF NOT EXISTS "IntegrationJob_googleIntegrationId_status_runAt_idx"
  ON "IntegrationJob"("googleIntegrationId", "status", "runAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationJob_googleIntegrationId_fkey') THEN
    ALTER TABLE "IntegrationJob"
      ADD CONSTRAINT "IntegrationJob_googleIntegrationId_fkey"
      FOREIGN KEY ("googleIntegrationId")
      REFERENCES "GoogleCalendarIntegration"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
