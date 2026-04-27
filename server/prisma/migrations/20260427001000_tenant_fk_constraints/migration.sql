-- Fase 0.2 — FK constraints clinicId → Tenant.id
--
-- Política:
--   ON DELETE RESTRICT — un Tenant nunca se borra duro mientras tenga datos.
--                        El soft-delete vía Tenant.deletedAt es la única vía.
--   ON UPDATE CASCADE  — defensivo; el id del tenant no debería cambiar.
--
-- Pre-condición: la migración 20260427000000_add_tenant_table ya insertó
-- el tenant con id='default'. Toda fila existente con clinicId='default'
-- hace match. Auditado: 8 users, 2 appointments, 0 integration_jobs,
-- 1 google_calendar_integration — todos con clinicId='default'.

-- ── Defensa en profundidad: NOT NULL en columnas que tenían default ──
-- Si el default desaparece y alguien hace INSERT sin clinicId, debe fallar
-- con un error claro, no insertar NULL silenciosamente.
ALTER TABLE "User"        ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "clinicId" SET NOT NULL;
-- IntegrationJob y GoogleCalendarIntegration ya son NOT NULL (sin default).

-- ── FKs ─────────────────────────────────────────────────────────────
ALTER TABLE "User"
    ADD CONSTRAINT "User_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Appointment"
    ADD CONSTRAINT "Appointment_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IntegrationJob"
    ADD CONSTRAINT "IntegrationJob_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoogleCalendarIntegration"
    ADD CONSTRAINT "GoogleCalendarIntegration_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
