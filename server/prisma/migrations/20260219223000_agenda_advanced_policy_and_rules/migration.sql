-- Advanced agenda policy controls + treatment buffers + treatment cabin priority rules.

ALTER TABLE "AgendaPolicy"
  ADD COLUMN IF NOT EXISTS "maxActiveAppointmentsPerWeek" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "maxActiveAppointmentsPerMonth" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "AgendaTreatment"
  ADD COLUMN IF NOT EXISTS "prepBufferMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cleanupBufferMinutes" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "AgendaTreatmentCabinRule" (
  "id" TEXT NOT NULL,
  "treatmentId" TEXT NOT NULL,
  "cabinId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaTreatmentCabinRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgendaTreatmentCabinRule_treatmentId_cabinId_key"
  ON "AgendaTreatmentCabinRule"("treatmentId", "cabinId");
CREATE INDEX IF NOT EXISTS "AgendaTreatmentCabinRule_treatmentId_priority_idx"
  ON "AgendaTreatmentCabinRule"("treatmentId", "priority");
CREATE INDEX IF NOT EXISTS "AgendaTreatmentCabinRule_cabinId_idx"
  ON "AgendaTreatmentCabinRule"("cabinId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgendaTreatmentCabinRule_treatmentId_fkey') THEN
    ALTER TABLE "AgendaTreatmentCabinRule"
      ADD CONSTRAINT "AgendaTreatmentCabinRule_treatmentId_fkey"
      FOREIGN KEY ("treatmentId") REFERENCES "AgendaTreatment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgendaTreatmentCabinRule_cabinId_fkey') THEN
    ALTER TABLE "AgendaTreatmentCabinRule"
      ADD CONSTRAINT "AgendaTreatmentCabinRule_cabinId_fkey"
      FOREIGN KEY ("cabinId") REFERENCES "AgendaCabin"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "AgendaTreatmentCabinRule" (
  "id", "treatmentId", "cabinId", "priority", "updatedAt"
)
SELECT
  'atcr_' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 24),
  t."id",
  t."cabinId",
  1,
  NOW()
FROM "AgendaTreatment" t
WHERE t."cabinId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "AgendaTreatmentCabinRule" r
    WHERE r."treatmentId" = t."id"
      AND r."cabinId" = t."cabinId"
  );
