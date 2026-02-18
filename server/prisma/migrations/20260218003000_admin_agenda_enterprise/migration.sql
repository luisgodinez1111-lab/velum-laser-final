-- Enterprise agenda controls: cabins, day rules, persistent blocks and workflow fields.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "cabinId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "noShowAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "autoConfirmedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AgendaPolicy" (
  "id" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Chihuahua',
  "slotMinutes" INTEGER NOT NULL DEFAULT 30,
  "autoConfirmHours" INTEGER NOT NULL DEFAULT 12,
  "noShowGraceMinutes" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgendaCabin" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaCabin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgendaWeeklyRule" (
  "id" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "isOpen" BOOLEAN NOT NULL DEFAULT true,
  "startHour" INTEGER NOT NULL DEFAULT 9,
  "endHour" INTEGER NOT NULL DEFAULT 20,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaWeeklyRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgendaSpecialDateRule" (
  "id" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "isOpen" BOOLEAN NOT NULL DEFAULT false,
  "startHour" INTEGER,
  "endHour" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaSpecialDateRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgendaBlockedSlot" (
  "id" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "reason" TEXT,
  "cabinId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaBlockedSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Appointment_cabinId_idx" ON "Appointment"("cabinId");
CREATE INDEX IF NOT EXISTS "Appointment_cabinId_startAt_endAt_idx" ON "Appointment"("cabinId", "startAt", "endAt");

CREATE INDEX IF NOT EXISTS "AgendaCabin_isActive_sortOrder_idx" ON "AgendaCabin"("isActive", "sortOrder");

CREATE UNIQUE INDEX IF NOT EXISTS "AgendaWeeklyRule_dayOfWeek_key" ON "AgendaWeeklyRule"("dayOfWeek");

CREATE UNIQUE INDEX IF NOT EXISTS "AgendaSpecialDateRule_dateKey_key" ON "AgendaSpecialDateRule"("dateKey");

CREATE INDEX IF NOT EXISTS "AgendaBlockedSlot_dateKey_idx" ON "AgendaBlockedSlot"("dateKey");
CREATE INDEX IF NOT EXISTS "AgendaBlockedSlot_dateKey_startMinute_endMinute_idx" ON "AgendaBlockedSlot"("dateKey", "startMinute", "endMinute");
CREATE INDEX IF NOT EXISTS "AgendaBlockedSlot_cabinId_idx" ON "AgendaBlockedSlot"("cabinId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_cabinId_fkey') THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT "Appointment_cabinId_fkey"
      FOREIGN KEY ("cabinId") REFERENCES "AgendaCabin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgendaBlockedSlot_cabinId_fkey') THEN
    ALTER TABLE "AgendaBlockedSlot"
      ADD CONSTRAINT "AgendaBlockedSlot_cabinId_fkey"
      FOREIGN KEY ("cabinId") REFERENCES "AgendaCabin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgendaBlockedSlot_createdByUserId_fkey') THEN
    ALTER TABLE "AgendaBlockedSlot"
      ADD CONSTRAINT "AgendaBlockedSlot_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
