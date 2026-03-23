CREATE INDEX IF NOT EXISTS "Payment_userId_status_createdAt_idx" ON "Payment"("userId", "status", "createdAt");
