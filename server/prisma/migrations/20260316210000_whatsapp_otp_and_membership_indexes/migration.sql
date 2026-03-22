-- Migration: WhatsappOtp model + Membership indexes + new Membership fields

-- Add missing Membership fields (added by stripeWebhookService but not in schema)
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "planCode" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "lastStripeEventId" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "lastStripeEventType" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- Performance indexes on Membership
CREATE INDEX IF NOT EXISTS "Membership_status_idx" ON "Membership"("status");
CREATE INDEX IF NOT EXISTS "Membership_currentPeriodEnd_idx" ON "Membership"("currentPeriodEnd");
CREATE INDEX IF NOT EXISTS "Membership_stripeCustomerId_idx" ON "Membership"("stripeCustomerId");

-- WhatsappOtp table (DB-persisted OTPs, replaces in-memory Map)
CREATE TABLE IF NOT EXISTS "WhatsappOtp" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "codeHash"  TEXT NOT NULL,
    "phone"     TEXT NOT NULL,
    "attempts"  INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappOtp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappOtp_userId_key" ON "WhatsappOtp"("userId");
CREATE INDEX IF NOT EXISTS "WhatsappOtp_userId_idx" ON "WhatsappOtp"("userId");
CREATE INDEX IF NOT EXISTS "WhatsappOtp_expiresAt_idx" ON "WhatsappOtp"("expiresAt");
