-- Fase 0.4 — Row-Level Security en tablas con clinicId directo.
--
-- Filosofía:
--   - RLS habilitado en las 4 tablas root con clinicId.
--   - Política con FALLBACK PERMISIVO: si `app.tenant_id` NO está seteado, la
--     policy permite todo. Esto desacopla la migración de la activación —
--     hasta que la app ejecute `SET LOCAL app.tenant_id`, el comportamiento
--     es idéntico al actual.
--   - Postgres bypassea RLS para superusers — perfecto para migrations,
--     backups y mantenimiento. El refuerzo real ocurre cuando la app conecta
--     como rol no-superuser (Fase 1: rol `app_user`). Por ahora, postgres
--     sigue siendo el conector y RLS se activa porque ejecutamos
--     SET LOCAL app.tenant_id desde la app — pero eso solo afecta queries
--     hechas por roles no-superuser. Para validar el comportamiento real,
--     creamos un rol de prueba en la sanity check.
--
-- Limitación conocida (deuda explícita):
--   Tablas hijas con datos sensibles (Payment, MedicalIntake, etc.) NO
--   tienen RLS aún. Su aislamiento depende del scoping vía JOIN al User.
--   Plan: denormalizar tenantId a esas tablas en Fase 1.

-- ── 0. Helper: lee app.tenant_id con fallback permisivo a NULL ──────
CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$;

COMMENT ON FUNCTION app_current_tenant_id IS
  'Devuelve app.tenant_id seteado por SET LOCAL desde la app, o NULL si no hay contexto. Las policies USING usan esto.';

-- ── 1. Habilitar RLS ───────────────────────────────────────────────
ALTER TABLE "User"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationJob"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarIntegration" ENABLE ROW LEVEL SECURITY;

-- ── 2. Políticas ───────────────────────────────────────────────────
CREATE POLICY tenant_isolation ON "User"
  USING      (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id());

CREATE POLICY tenant_isolation ON "Appointment"
  USING      (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id());

CREATE POLICY tenant_isolation ON "IntegrationJob"
  USING      (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id());

CREATE POLICY tenant_isolation ON "GoogleCalendarIntegration"
  USING      (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id());

-- ── 3. Sanity check con rol temporal no-superuser ──────────────────
-- Postgres bypassea RLS para superusers. Para validar las policies, creamos
-- un rol temporal sin privilegios especiales y probamos como ese rol.
DO $$
DECLARE
  cnt_no_ctx       INT;
  cnt_default_ctx  INT;
  cnt_other_ctx    INT;
  rls_test_role TEXT := 'rls_sanity_check_role';
BEGIN
  -- Crear rol efímero
  EXECUTE format('CREATE ROLE %I NOLOGIN', rls_test_role);
  EXECUTE format('GRANT SELECT ON "User" TO %I', rls_test_role);

  -- Cambiar al rol de prueba — ahora SÍ aplica RLS
  EXECUTE format('SET LOCAL ROLE %I', rls_test_role);

  -- Sin contexto: fallback permisivo — debe ver todo (8)
  PERFORM set_config('app.tenant_id', '', true);
  SELECT COUNT(*) INTO cnt_no_ctx FROM "User";

  -- Tenant 'default': los 8 users del seed
  PERFORM set_config('app.tenant_id', 'default', true);
  SELECT COUNT(*) INTO cnt_default_ctx FROM "User";

  -- Tenant inexistente: 0
  PERFORM set_config('app.tenant_id', 'tenant-no-existe', true);
  SELECT COUNT(*) INTO cnt_other_ctx FROM "User";

  -- Volver al rol original (postgres) y limpiar
  RESET ROLE;
  EXECUTE format('REVOKE ALL ON "User" FROM %I', rls_test_role);
  EXECUTE format('DROP ROLE %I', rls_test_role);

  IF cnt_no_ctx <> cnt_default_ctx THEN
    RAISE EXCEPTION 'RLS sanity check FAIL: sin contexto (%) != tenant default (%)', cnt_no_ctx, cnt_default_ctx;
  END IF;
  IF cnt_other_ctx <> 0 THEN
    RAISE EXCEPTION 'RLS sanity check FAIL: tenant inexistente debería ver 0 users, ve %', cnt_other_ctx;
  END IF;

  RAISE NOTICE 'RLS sanity check OK: no_ctx=% default=% other=%', cnt_no_ctx, cnt_default_ctx, cnt_other_ctx;
END $$;
