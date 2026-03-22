-- AddCompositeIndexes
CREATE INDEX IF NOT EXISTS "Appointment_userId_startAt_idx" ON "Appointment"("userId", "startAt");
CREATE INDEX IF NOT EXISTS "Payment_membershipId_createdAt_idx" ON "Payment"("membershipId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_resourceType_createdAt_idx" ON "AuditLog"("resourceType", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
