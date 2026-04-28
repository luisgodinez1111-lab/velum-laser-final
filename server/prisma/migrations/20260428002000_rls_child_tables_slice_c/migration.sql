-- Fase 1.5 Slice C — RLS en marketing + agenda (último slice).
--
-- Tablas marketing (2): Lead, MarketingAttribution.
-- Tablas agenda (7): AgendaPolicy, AgendaCabin, AgendaTreatment,
--                    AgendaTreatmentCabinRule, AgendaWeeklyRule,
--                    AgendaSpecialDateRule, AgendaBlockedSlot.
--
-- Decisión arquitectónica: las tablas Agenda pasan a ser TENANT-SCOPED.
-- Cada tenant (clínica) tendrá su propio catálogo de cabinas, tratamientos,
-- horarios y bloqueos. Hoy hay un solo tenant 'default', así que la
-- migración solo añade la dimensión sin romper nada.
--
-- Cambios estructurales (no solo aditivos):
--   - AgendaTreatment.code:        UNIQUE → UNIQUE(tenantId, code)
--   - AgendaWeeklyRule.dayOfWeek:  UNIQUE → UNIQUE(tenantId, dayOfWeek)
--   - AgendaSpecialDateRule.dateKey: UNIQUE → UNIQUE(tenantId, dateKey)
--   El resto mantiene sus uniques actuales.
--
-- Marketing: backfill via convertedUserId / userId opcional → COALESCE
-- a 'default' cuando ambos NULL.

-- ── 0. Lead ───────────────────────────────────────────────────────────
ALTER TABLE "Lead" ADD COLUMN "tenantId" TEXT;
UPDATE "Lead" l SET "tenantId" = COALESCE(
  (SELECT "clinicId" FROM "User" WHERE "id" = l."convertedUserId"),
  'default'
);
ALTER TABLE "Lead" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Lead" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Lead"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 1. MarketingAttribution ───────────────────────────────────────────
-- Backfill: prioridad userId > leadId.tenantId > 'default'.
ALTER TABLE "MarketingAttribution" ADD COLUMN "tenantId" TEXT;
UPDATE "MarketingAttribution" ma SET "tenantId" = COALESCE(
  (SELECT "clinicId" FROM "User" WHERE "id" = ma."userId"),
  (SELECT l."tenantId" FROM "Lead" l WHERE l."id" = ma."leadId"),
  'default'
);
ALTER TABLE "MarketingAttribution" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MarketingAttribution" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MarketingAttribution_tenantId_idx" ON "MarketingAttribution"("tenantId");

ALTER TABLE "MarketingAttribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingAttribution" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MarketingAttribution"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 2. AgendaPolicy ───────────────────────────────────────────────────
-- Singleton por tenant. Hoy single-tenant → 1 fila.
ALTER TABLE "AgendaPolicy" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "AgendaPolicy" ADD CONSTRAINT "AgendaPolicy_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AgendaPolicy_tenantId_idx" ON "AgendaPolicy"("tenantId");

ALTER TABLE "AgendaPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgendaPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgendaPolicy"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 3. AgendaCabin ────────────────────────────────────────────────────
ALTER TABLE "AgendaCabin" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "AgendaCabin" ADD CONSTRAINT "AgendaCabin_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AgendaCabin_tenantId_idx" ON "AgendaCabin"("tenantId");

ALTER TABLE "AgendaCabin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgendaCabin" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgendaCabin"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 4. AgendaTreatment — UNIQUE(code) → UNIQUE(tenantId, code) ────────
ALTER TABLE "AgendaTreatment" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "AgendaTreatment" ADD CONSTRAINT "AgendaTreatment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AgendaTreatment_tenantId_idx" ON "AgendaTreatment"("tenantId");

-- Reemplazar unique global por compuesto. Las migraciones antiguas de
-- Prisma crearon estos uniques como CREATE UNIQUE INDEX (no como
-- ADD CONSTRAINT), así que usamos DROP INDEX que aplica a ambos casos.
ALTER TABLE "AgendaTreatment" DROP CONSTRAINT IF EXISTS "AgendaTreatment_code_key";
DROP INDEX IF EXISTS "AgendaTreatment_code_key";
ALTER TABLE "AgendaTreatment" ADD CONSTRAINT "AgendaTreatment_tenantId_code_key" UNIQUE ("tenantId", "code");

ALTER TABLE "AgendaTreatment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgendaTreatment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgendaTreatment"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 5. AgendaTreatmentCabinRule ───────────────────────────────────────
-- Backfill via JOIN a treatment (que ya tiene tenantId). El unique
-- existente [treatmentId, cabinId] sigue válido (treatments y cabins
-- ya están scoped por tenant via FK).
ALTER TABLE "AgendaTreatmentCabinRule" ADD COLUMN "tenantId" TEXT;
UPDATE "AgendaTreatmentCabinRule" r SET "tenantId" = t."tenantId"
  FROM "AgendaTreatment" t WHERE r."treatmentId" = t."id";
ALTER TABLE "AgendaTreatmentCabinRule" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AgendaTreatmentCabinRule" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "AgendaTreatmentCabinRule" ADD CONSTRAINT "AgendaTreatmentCabinRule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AgendaTreatmentCabinRule_tenantId_idx" ON "AgendaTreatmentCabinRule"("tenantId");

ALTER TABLE "AgendaTreatmentCabinRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgendaTreatmentCabinRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgendaTreatmentCabinRule"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 6. AgendaWeeklyRule — UNIQUE(dayOfWeek) → UNIQUE(tenantId, dayOfWeek)
ALTER TABLE "AgendaWeeklyRule" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "AgendaWeeklyRule" ADD CONSTRAINT "AgendaWeeklyRule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AgendaWeeklyRule_tenantId_idx" ON "AgendaWeeklyRule"("tenantId");

ALTER TABLE "AgendaWeeklyRule" DROP CONSTRAINT IF EXISTS "AgendaWeeklyRule_dayOfWeek_key";
DROP INDEX IF EXISTS "AgendaWeeklyRule_dayOfWeek_key";
ALTER TABLE "AgendaWeeklyRule" ADD CONSTRAINT "AgendaWeeklyRule_tenantId_dayOfWeek_key" UNIQUE ("tenantId", "dayOfWeek");

ALTER TABLE "AgendaWeeklyRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgendaWeeklyRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgendaWeeklyRule"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 7. AgendaSpecialDateRule — UNIQUE(dateKey) → UNIQUE(tenantId, dateKey)
ALTER TABLE "AgendaSpecialDateRule" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "AgendaSpecialDateRule" ADD CONSTRAINT "AgendaSpecialDateRule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AgendaSpecialDateRule_tenantId_idx" ON "AgendaSpecialDateRule"("tenantId");

ALTER TABLE "AgendaSpecialDateRule" DROP CONSTRAINT IF EXISTS "AgendaSpecialDateRule_dateKey_key";
DROP INDEX IF EXISTS "AgendaSpecialDateRule_dateKey_key";
ALTER TABLE "AgendaSpecialDateRule" ADD CONSTRAINT "AgendaSpecialDateRule_tenantId_dateKey_key" UNIQUE ("tenantId", "dateKey");

ALTER TABLE "AgendaSpecialDateRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgendaSpecialDateRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgendaSpecialDateRule"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 8. AgendaBlockedSlot ──────────────────────────────────────────────
ALTER TABLE "AgendaBlockedSlot" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "AgendaBlockedSlot" ADD CONSTRAINT "AgendaBlockedSlot_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AgendaBlockedSlot_tenantId_idx" ON "AgendaBlockedSlot"("tenantId");

ALTER TABLE "AgendaBlockedSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgendaBlockedSlot" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgendaBlockedSlot"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── Sanity check con velumapp ─────────────────────────────────────────
DO $$
DECLARE
  visible_no_ctx INT;
  visible_default INT;
  visible_bogus INT;
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'Lead','MarketingAttribution',
    'AgendaPolicy','AgendaCabin','AgendaTreatment','AgendaTreatmentCabinRule',
    'AgendaWeeklyRule','AgendaSpecialDateRule','AgendaBlockedSlot'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'velumapp') THEN
    RAISE NOTICE 'sanity skip: rol velumapp no existe';
    RETURN;
  END IF;

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
