-- CreateTable
CREATE TABLE IF NOT EXISTS "ConsentOtpToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentOtpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ConsentOtpToken_userId_key" ON "ConsentOtpToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ConsentOtpToken_token_key" ON "ConsentOtpToken"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsentOtpToken_userId_idx" ON "ConsentOtpToken"("userId");

-- AddForeignKey
ALTER TABLE "ConsentOtpToken" ADD CONSTRAINT "ConsentOtpToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
