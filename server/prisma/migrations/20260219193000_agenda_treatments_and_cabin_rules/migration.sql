-- Agenda treatments + treatment-to-cabin rules + appointment treatment link.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "treatmentId" TEXT;

CREATE TABLE IF NOT EXISTS "AgendaTreatment" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "durationMinutes" INTEGER NOT NULL DEFAULT 45,
  "cabinId" TEXT,
  "requiresSpecificCabin" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaTreatment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgendaTreatment_code_key" ON "AgendaTreatment"("code");
CREATE INDEX IF NOT EXISTS "AgendaTreatment_isActive_sortOrder_idx" ON "AgendaTreatment"("isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "AgendaTreatment_cabinId_idx" ON "AgendaTreatment"("cabinId");
CREATE INDEX IF NOT EXISTS "Appointment_treatmentId_idx" ON "Appointment"("treatmentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgendaTreatment_cabinId_fkey') THEN
    ALTER TABLE "AgendaTreatment"
      ADD CONSTRAINT "AgendaTreatment_cabinId_fkey"
      FOREIGN KEY ("cabinId") REFERENCES "AgendaCabin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_treatmentId_fkey') THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT "Appointment_treatmentId_fkey"
      FOREIGN KEY ("treatmentId") REFERENCES "AgendaTreatment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "AgendaTreatment" (
  "id", "name", "code", "description", "durationMinutes", "isActive", "sortOrder", "updatedAt"
)
SELECT
  'agt_' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 24),
  'Valoración',
  'valuation',
  'Primera valoración clínica',
  45,
  true,
  1,
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AgendaTreatment" WHERE "code" = 'valuation');

INSERT INTO "AgendaTreatment" (
  "id", "name", "code", "description", "durationMinutes", "isActive", "sortOrder", "updatedAt"
)
SELECT
  'agt_' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 24),
  'Sesión Láser',
  'laser_session',
  'Sesión regular de tratamiento láser',
  45,
  true,
  2,
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AgendaTreatment" WHERE "code" = 'laser_session');
