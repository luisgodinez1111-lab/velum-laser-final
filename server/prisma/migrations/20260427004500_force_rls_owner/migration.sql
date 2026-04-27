-- Fase 1.4.a — FORCE ROW LEVEL SECURITY en tablas con tenant.
--
-- Hallazgo: las tablas son OWNED BY velumapp (no postgres). Postgres exime al
-- OWNER de evaluar RLS policies por defecto. Aunque velumapp NO es superuser
-- y NO tiene BYPASSRLS, sí es owner — y eso era suficiente para que las
-- policies de Fase 0.4 fueran letra muerta.
--
-- FORCE ROW LEVEL SECURITY revoca esa exención: incluso el owner se evalúa
-- contra las policies. La excepción son superusers (postgres) que siguen
-- bypaseando — perfecto para migrations y mantenimiento.
--
-- Seguridad de este cambio:
--   La policy actual es `tenant_id IS NULL OR clinicId = tenant_id`.
--   El fallback `IS NULL` significa que sin SET LOCAL app.tenant_id, la
--   query devuelve TODO. La app hoy NO setea el GUC, así que post-migración
--   el comportamiento visible es IDÉNTICO al actual.
--
-- Cuándo cambia el comportamiento:
--   Cuando se active RLS_ENFORCE=true (Fase 1.4.b) y los callers se
--   refactoreen a withTenantContext(), el GUC se seteará y las policies
--   filtrarán por tenant. Hasta entonces: cero cambio runtime.

ALTER TABLE "User"                      FORCE ROW LEVEL SECURITY;
ALTER TABLE "Appointment"               FORCE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationJob"            FORCE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarIntegration" FORCE ROW LEVEL SECURITY;

-- ── Sanity check: con velumapp y sin contexto, sigue viendo TODO ─────
-- (fallback permisivo del policy). Si esto fallara, abortar antes de prod.
DO $$
DECLARE
  visible_all INT;
  visible_default INT;
  visible_bogus INT;
BEGIN
  -- Cambiar al rol velumapp (que es el que la app usa)
  EXECUTE 'SET LOCAL ROLE velumapp';

  PERFORM set_config('app.tenant_id', '', true);
  SELECT COUNT(*) INTO visible_all FROM "User";

  PERFORM set_config('app.tenant_id', 'default', true);
  SELECT COUNT(*) INTO visible_default FROM "User";

  PERFORM set_config('app.tenant_id', 'no-existe', true);
  SELECT COUNT(*) INTO visible_bogus FROM "User";

  RESET ROLE;

  IF visible_all <> visible_default THEN
    RAISE EXCEPTION 'sanity FAIL: sin contexto (%) != tenant default (%) — fallback permisivo no funciona', visible_all, visible_default;
  END IF;
  IF visible_bogus <> 0 THEN
    RAISE EXCEPTION 'sanity FAIL: tenant inexistente debería ver 0 users, ve %', visible_bogus;
  END IF;

  RAISE NOTICE 'RLS sanity OK con velumapp: no_ctx=% default=% bogus=%', visible_all, visible_default, visible_bogus;
END $$;
