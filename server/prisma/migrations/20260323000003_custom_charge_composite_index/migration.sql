-- AddIndex: composite (userId, status) on CustomCharge for fast per-user status queries
CREATE INDEX IF NOT EXISTS "CustomCharge_userId_status_idx" ON "CustomCharge"("userId", "status");
