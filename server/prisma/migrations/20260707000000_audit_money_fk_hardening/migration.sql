-- Endurecimiento: dinero exacto, FKs no destructivas y AuditLog append-only.
-- Portable a Postgres gestionado (Neon): sin operaciones de superusuario,
-- idempotente (IF EXISTS / IF NOT EXISTS) y tolerante a que el rol app_user
-- no exista todavía. Revisar contra un snapshot de la BD antes de migrate deploy.

-- ── 1. Membership.amount: Float → Int (pesos enteros, como Payment) ──────────
-- Elimina errores de redondeo IEEE-754. round() cubre cualquier valor
-- fraccionario histórico; NULL se mantiene NULL.
ALTER TABLE "Membership"
  ALTER COLUMN "amount" TYPE INTEGER USING round("amount")::integer;

-- ── 2. onDelete Cascade → Restrict en tablas con retención legal ─────────────
-- Un DELETE accidental de un User ya NO arrastra expediente clínico, pagos,
-- documentos, sesiones ni membresía. El borrado real de la app es soft-delete.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MedicalIntake_userId_fkey') THEN
    ALTER TABLE "MedicalIntake" DROP CONSTRAINT "MedicalIntake_userId_fkey";
  END IF;
  ALTER TABLE "MedicalIntake" ADD CONSTRAINT "MedicalIntake_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_userId_fkey') THEN
    ALTER TABLE "Payment" DROP CONSTRAINT "Payment_userId_fkey";
  END IF;
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_userId_fkey') THEN
    ALTER TABLE "Document" DROP CONSTRAINT "Document_userId_fkey";
  END IF;
  ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionTreatment_userId_fkey') THEN
    ALTER TABLE "SessionTreatment" DROP CONSTRAINT "SessionTreatment_userId_fkey";
  END IF;
  ALTER TABLE "SessionTreatment" ADD CONSTRAINT "SessionTreatment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_userId_fkey') THEN
    ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";
  END IF;
  ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END $$;

-- ── 3. Índice para filtros por AuditLog.resourceId ──────────────────────────
-- Filtro real en auditAdminController / v1AuditController sobre la tabla de
-- mayor crecimiento del sistema; evita el seq scan.
CREATE INDEX IF NOT EXISTS "AuditLog_resourceId_idx" ON "AuditLog"("resourceId");

-- ── 4. AuditLog append-only a nivel de base ─────────────────────────────────
-- La conexión de la app (app_user) no puede editar ni borrar el rastro de
-- auditoría: una inyección SQL o un script con esa conexión no puede reescribir
-- la historia. Solo aplica si el rol existe (setup Neon/portable).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE UPDATE, DELETE ON "AuditLog" FROM app_user;
  END IF;
END $$;
