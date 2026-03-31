-- Migration: 20260324000001_composite_indexes
-- Adds composite indexes for soft-delete filtering and appointment conflict queries

CREATE INDEX IF NOT EXISTS "User_deletedAt_createdAt_idx" ON "User"("deletedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Appointment_clinicId_userId_startAt_status_idx" ON "Appointment"("clinicId", "userId", "startAt", "status");
