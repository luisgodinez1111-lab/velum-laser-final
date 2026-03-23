-- Convert key DateTime columns to timestamptz for proper timezone handling
-- Non-destructive: existing data is preserved, PostgreSQL converts automatically

-- EmailVerificationToken
ALTER TABLE "EmailVerificationToken" ALTER COLUMN "expiresAt" TYPE timestamptz USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "EmailVerificationToken" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';

-- PasswordResetToken
ALTER TABLE "PasswordResetToken" ALTER COLUMN "expiresAt" TYPE timestamptz USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "PasswordResetToken" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';

-- ConsentOtpToken
ALTER TABLE "ConsentOtpToken" ALTER COLUMN "expiresAt" TYPE timestamptz USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "ConsentOtpToken" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';

-- RefreshToken
ALTER TABLE "RefreshToken" ALTER COLUMN "expiresAt" TYPE timestamptz USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "RefreshToken" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';

-- WhatsappOtp
ALTER TABLE "WhatsappOtp" ALTER COLUMN "expiresAt" TYPE timestamptz USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "WhatsappOtp" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';

-- DeleteOtp
ALTER TABLE "DeleteOtp" ALTER COLUMN "expiresAt" TYPE timestamptz USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "DeleteOtp" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';

-- Appointment: critical for timezone-aware scheduling
ALTER TABLE "Appointment" ALTER COLUMN "startAt" TYPE timestamptz USING "startAt" AT TIME ZONE 'UTC';
ALTER TABLE "Appointment" ALTER COLUMN "endAt" TYPE timestamptz USING "endAt" AT TIME ZONE 'UTC';

-- New indexes on expiresAt for efficient token cleanup queries
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "ConsentOtpToken_expiresAt_idx" ON "ConsentOtpToken"("expiresAt");
