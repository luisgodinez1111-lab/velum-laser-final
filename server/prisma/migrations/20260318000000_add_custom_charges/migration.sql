-- CreateEnum
CREATE TYPE "CustomChargeType" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "CustomChargeStatus" AS ENUM ('PENDING_ACCEPTANCE', 'ACCEPTED', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CustomCharge" (
    "id"                    TEXT NOT NULL,
    "userId"                TEXT NOT NULL,
    "createdByAdminId"      TEXT,
    "title"                 TEXT NOT NULL,
    "description"           TEXT,
    "amount"                INTEGER NOT NULL,
    "currency"              TEXT NOT NULL DEFAULT 'mxn',
    "type"                  "CustomChargeType" NOT NULL DEFAULT 'ONE_TIME',
    "interval"              TEXT,
    "otpHash"               TEXT,
    "otpExpiresAt"          TIMESTAMP(3),
    "otpAttempts"           INTEGER NOT NULL DEFAULT 0,
    "stripeSessionId"       TEXT,
    "stripeSessionUrl"      TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeSubscriptionId"  TEXT,
    "status"                "CustomChargeStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    "acceptedAt"            TIMESTAMP(3),
    "paidAt"                TIMESTAMP(3),
    "expiresAt"             TIMESTAMP(3),
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomCharge_userId_idx" ON "CustomCharge"("userId");

-- CreateIndex
CREATE INDEX "CustomCharge_status_idx" ON "CustomCharge"("status");

-- CreateIndex
CREATE INDEX "CustomCharge_createdAt_idx" ON "CustomCharge"("createdAt");

-- AddForeignKey
ALTER TABLE "CustomCharge" ADD CONSTRAINT "CustomCharge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
