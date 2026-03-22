-- CreateTable
CREATE TABLE IF NOT EXISTS "DeleteOtp" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeleteOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeleteOtp_actorUserId_key" ON "DeleteOtp"("actorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeleteOtp_actorUserId_idx" ON "DeleteOtp"("actorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeleteOtp_expiresAt_idx" ON "DeleteOtp"("expiresAt");
