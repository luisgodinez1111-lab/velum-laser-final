-- AlterTable: add nextChargeAt for RECURRING custom charge auto-renewal
ALTER TABLE "CustomCharge" ADD COLUMN "nextChargeAt" TIMESTAMP(3);

-- Index to make cron queries efficient
CREATE INDEX "CustomCharge_nextChargeAt_idx" ON "CustomCharge"("nextChargeAt");
