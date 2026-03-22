-- Migration: schema_improvements
-- Creates CustomChargeInterval enum, adds Lead.convertedUserId index,
-- adds MedicalIntake.signatureImageData field

-- 1. CreateEnum CustomChargeInterval
CREATE TYPE "CustomChargeInterval" AS ENUM ('day', 'week', 'month', 'year', 'once');

-- 2. AlterTable CustomCharge — convert interval from text to enum
--    Existing values ('day','week','month','year') map directly to enum members.
--    NULL values remain NULL. Invalid values would fail — none expected in production.
ALTER TABLE "CustomCharge" ALTER COLUMN "interval" DROP DEFAULT;
ALTER TABLE "CustomCharge"
  ALTER COLUMN "interval" TYPE "CustomChargeInterval"
  USING "interval"::"CustomChargeInterval";

-- 3. CreateIndex Lead.convertedUserId
CREATE INDEX IF NOT EXISTS "Lead_convertedUserId_idx" ON "Lead"("convertedUserId");

-- 4. AlterTable MedicalIntake — add signatureImageData
ALTER TABLE "MedicalIntake" ADD COLUMN IF NOT EXISTS "signatureImageData" TEXT;
