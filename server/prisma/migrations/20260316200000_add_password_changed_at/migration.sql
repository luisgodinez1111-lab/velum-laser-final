-- Add passwordChangedAt to User for JWT invalidation after password reset/change
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
