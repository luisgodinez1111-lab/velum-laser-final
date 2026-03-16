-- CreateIndex
CREATE INDEX IF NOT EXISTS "Appointment_status_startAt_idx" ON "Appointment"("status", "startAt");
