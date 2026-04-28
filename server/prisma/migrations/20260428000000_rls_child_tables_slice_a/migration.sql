-- Fase 1.5 Slice A — RLS en tablas hijas con datos clínicos/financieros.
--
-- Tablas: Membership, Payment, Document, MedicalIntake, SessionTreatment,
--         CustomCharge, Notification, AuditLog.
--
-- Patrón (idéntico a 20260427002000_rls_tenant_isolation):
--   1. ADD COLUMN "tenantId" TEXT (nullable transitorio)
--   2. Backfill desde "User"."clinicId" via JOIN por userId
--   3. SET NOT NULL + DEFAULT 'default' (back-compat con código actual)
--   4. FK a "Tenant"("id") + INDEX
--   5. ENABLE + FORCE ROW LEVEL SECURITY + policy con fallback permisivo
--
-- Filosofía:
--   - Mismo fallback `app_current_tenant_id() IS NULL OR ...` que las root —
--     el comportamiento runtime hoy es idéntico al pre-migración. Cero
--     degradación visible mientras todos los callers ya están en
--     withTenantContext (Fase 1.4.b).
--   - DEFAULT 'default' permite que callers que aún no pasen tenantId
--     explícitamente sigan funcionando en single-tenant. Cuando entre el 2do
--     tenant, hay que (a) refactorear los `.create` para pasar tenantId
--     explícito y (b) eliminar el DEFAULT — deuda explícita Fase 2.
--
-- Sanity check intra-migración: con velumapp (no-superuser, FORCE RLS),
-- sin contexto debe ver TODO (fallback), con tenant inexistente debe
-- ver 0 — replica el mismo check que la migración 0.4.

-- ── 0. Membership ─────────────────────────────────────────────────────
ALTER TABLE "Membership" ADD COLUMN "tenantId" TEXT;
UPDATE "Membership" m SET "tenantId" = u."clinicId"
  FROM "User" u WHERE m."userId" = u."id";
ALTER TABLE "Membership" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Membership" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Membership"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 1. Payment ────────────────────────────────────────────────────────
ALTER TABLE "Payment" ADD COLUMN "tenantId" TEXT;
UPDATE "Payment" p SET "tenantId" = u."clinicId"
  FROM "User" u WHERE p."userId" = u."id";
ALTER TABLE "Payment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 2. Document ───────────────────────────────────────────────────────
ALTER TABLE "Document" ADD COLUMN "tenantId" TEXT;
UPDATE "Document" d SET "tenantId" = u."clinicId"
  FROM "User" u WHERE d."userId" = u."id";
ALTER TABLE "Document" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Document"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 3. MedicalIntake ──────────────────────────────────────────────────
ALTER TABLE "MedicalIntake" ADD COLUMN "tenantId" TEXT;
UPDATE "MedicalIntake" mi SET "tenantId" = u."clinicId"
  FROM "User" u WHERE mi."userId" = u."id";
ALTER TABLE "MedicalIntake" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MedicalIntake" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "MedicalIntake" ADD CONSTRAINT "MedicalIntake_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MedicalIntake_tenantId_idx" ON "MedicalIntake"("tenantId");

ALTER TABLE "MedicalIntake" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedicalIntake" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MedicalIntake"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 4. SessionTreatment ───────────────────────────────────────────────
-- Backfill desde el User paciente (userId), no desde staffUserId.
ALTER TABLE "SessionTreatment" ADD COLUMN "tenantId" TEXT;
UPDATE "SessionTreatment" s SET "tenantId" = u."clinicId"
  FROM "User" u WHERE s."userId" = u."id";
ALTER TABLE "SessionTreatment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SessionTreatment" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "SessionTreatment" ADD CONSTRAINT "SessionTreatment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SessionTreatment_tenantId_idx" ON "SessionTreatment"("tenantId");

ALTER TABLE "SessionTreatment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SessionTreatment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SessionTreatment"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 5. CustomCharge ───────────────────────────────────────────────────
ALTER TABLE "CustomCharge" ADD COLUMN "tenantId" TEXT;
UPDATE "CustomCharge" c SET "tenantId" = u."clinicId"
  FROM "User" u WHERE c."userId" = u."id";
ALTER TABLE "CustomCharge" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CustomCharge" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "CustomCharge" ADD CONSTRAINT "CustomCharge_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CustomCharge_tenantId_idx" ON "CustomCharge"("tenantId");

ALTER TABLE "CustomCharge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomCharge" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomCharge"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 6. Notification ───────────────────────────────────────────────────
ALTER TABLE "Notification" ADD COLUMN "tenantId" TEXT;
UPDATE "Notification" n SET "tenantId" = u."clinicId"
  FROM "User" u WHERE n."userId" = u."id";
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 7. AuditLog ───────────────────────────────────────────────────────
-- Caso especial: userId, actorUserId y targetUserId son nullable. Backfill
-- via COALESCE intentando los tres en orden; si todos NULL (logs de sistema
-- pre-multi-tenant), cae en 'default'.
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
UPDATE "AuditLog" al SET "tenantId" = COALESCE(
  (SELECT "clinicId" FROM "User" WHERE "id" = al."userId"),
  (SELECT "clinicId" FROM "User" WHERE "id" = al."actorUserId"),
  (SELECT "clinicId" FROM "User" WHERE "id" = al."targetUserId"),
  'default'
);
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── Sanity check con velumapp (no-superuser, FORCE RLS) ─────────────────
DO $$
DECLARE
  visible_no_ctx INT;
  visible_default INT;
  visible_bogus INT;
  tbl TEXT;
  tables TEXT[] := ARRAY['Membership','Payment','Document','MedicalIntake','SessionTreatment','CustomCharge','Notification','AuditLog'];
BEGIN
  -- Solo correr el sanity si el rol velumapp existe (CI puede no tenerlo).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'velumapp') THEN
    RAISE NOTICE 'sanity skip: rol velumapp no existe en este entorno';
    RETURN;
  END IF;

  -- Otorgar SELECT a velumapp por si las tablas son nuevas para el rol
  -- (ALTER DEFAULT PRIVILEGES ya lo cubre, pero es defensivo).
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('GRANT SELECT ON %I TO velumapp', tbl);
  END LOOP;

  EXECUTE 'SET LOCAL ROLE velumapp';

  FOREACH tbl IN ARRAY tables LOOP
    PERFORM set_config('app.tenant_id', '', true);
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO visible_no_ctx;

    PERFORM set_config('app.tenant_id', 'default', true);
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO visible_default;

    PERFORM set_config('app.tenant_id', 'tenant-no-existe', true);
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO visible_bogus;

    IF visible_no_ctx <> visible_default THEN
      RAISE EXCEPTION 'sanity FAIL en %: sin contexto (%) != tenant default (%)',
        tbl, visible_no_ctx, visible_default;
    END IF;
    IF visible_bogus <> 0 THEN
      RAISE EXCEPTION 'sanity FAIL en %: tenant inexistente debería ver 0, ve %',
        tbl, visible_bogus;
    END IF;

    RAISE NOTICE 'RLS sanity OK en %: no_ctx=% default=% bogus=%',
      tbl, visible_no_ctx, visible_default, visible_bogus;
  END LOOP;

  RESET ROLE;
END $$;
