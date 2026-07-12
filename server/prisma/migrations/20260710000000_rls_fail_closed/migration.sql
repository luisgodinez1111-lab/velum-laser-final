-- Etapa 4 — FAIL-CLOSED: quitar el fallback permisivo de las policies RLS.
--
-- Antes (Etapa 0.4): USING (app_current_tenant_id() IS NULL OR col = app_current_tenant_id())
--   → sin app.tenant_id seteado, la policy dejaba pasar TODO (permisivo).
-- Ahora: USING (col = app_current_tenant_id())
--   → sin contexto de tenant, app_current_tenant_id() = NULL → col = NULL → 0 filas.
--   Éste es el AISLAMIENTO REAL: un call-site que olvide el contexto no filtra
--   datos de otros tenants; simplemente no ve nada (fail-closed).
--
-- ⚠️  PRE-REQUISITO DE DESPLIEGUE (orden estricto):
--   1. Configurar SYSTEM_DATABASE_URL (rol con BYPASSRLS, p.ej. neondb_owner) y
--      desplegar la app con el cliente `prismaSystem` — para que withSystemContext
--      (login por email, resolvers de webhook, etc.) siga funcionando sin tenant.
--   2. RECIÉN entonces aplicar esta migración.
--   Si se aplica ANTES del paso 1, con app_user (NOBYPASSRLS) el login devuelve 0
--   filas y NADIE puede entrar. Kill-switch: RLS_BYPASS_EMERGENCY=true revierte en
--   caliente a nivel app; o revertir esta migración (ver abajo).
--
-- Roles con BYPASSRLS (neondb_owner, neon_superuser) NO se ven afectados: siguen
-- viendo todo — es justo lo que usa la conexión privilegiada de withSystemContext.

-- ── 1. Recrear cada policy `tenant_isolation` en su forma estricta ──────────────
-- Iteramos las 31 policies existentes y detectamos su columna de tenant
-- (`tenantId` en las hijas, `clinicId` en las 4 root) automáticamente, para no
-- hardcodear la lista y sobrevivir a tablas nuevas.
DO $$
DECLARE
  r   RECORD;
  col TEXT;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
  LOOP
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = r.tablename AND column_name = 'tenantId')
        THEN 'tenantId'
      WHEN EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = r.tablename AND column_name = 'clinicId')
        THEN 'clinicId'
    END INTO col;

    IF col IS NULL THEN
      RAISE EXCEPTION 'Tabla % tiene policy tenant_isolation pero ninguna columna tenantId/clinicId', r.tablename;
    END IF;

    EXECUTE format('DROP POLICY tenant_isolation ON %I', r.tablename);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (%I = app_current_tenant_id()) '
      || 'WITH CHECK (%I = app_current_tenant_id())',
      r.tablename, col, col
    );
    RAISE NOTICE 'fail-closed aplicado: %.% (col=%)', 'public', r.tablename, col;
  END LOOP;
END $$;

-- ── 2. Auto-verificación: sin contexto = 0 filas (como rol no-bypass) ───────────
-- La migración corre como owner (BYPASSRLS) y no probaría nada por sí sola; usamos
-- un rol efímero sin privilegios especiales para verificar el fail-closed real.
DO $$
DECLARE
  cnt_no_ctx      INT;
  cnt_default_ctx INT;
  test_role TEXT := 'rls_failclosed_check_role';
BEGIN
  EXECUTE format('CREATE ROLE %I NOLOGIN', test_role);
  EXECUTE format('GRANT SELECT ON "User" TO %I', test_role);
  -- Portabilidad Neon: el rol que migra no es superuser, necesita ser miembro
  -- del rol efímero para poder SET ROLE.
  EXECUTE format('GRANT %I TO current_user', test_role);
  EXECUTE format('SET LOCAL ROLE %I', test_role);

  PERFORM set_config('app.tenant_id', '', true);        -- sin contexto
  SELECT COUNT(*) INTO cnt_no_ctx FROM "User";

  PERFORM set_config('app.tenant_id', 'default', true); -- tenant default
  SELECT COUNT(*) INTO cnt_default_ctx FROM "User";

  RESET ROLE;
  EXECUTE format('REVOKE ALL ON "User" FROM %I', test_role);
  EXECUTE format('DROP ROLE %I', test_role);

  IF cnt_no_ctx <> 0 THEN
    RAISE EXCEPTION 'FAIL-CLOSED roto: sin contexto se ven % filas de User (debería ser 0)', cnt_no_ctx;
  END IF;

  RAISE NOTICE 'fail-closed OK: sin_contexto=% (=0) · default=%', cnt_no_ctx, cnt_default_ctx;
END $$;

-- ── Rollback (manual, si hiciera falta revertir) ───────────────────────────────
-- Recrear la forma permisiva iterando igual pero con el prefijo IS NULL:
--   USING (app_current_tenant_id() IS NULL OR col = app_current_tenant_id())
-- (mismo DO block cambiando el CREATE POLICY). O activar RLS_BYPASS_EMERGENCY=true
-- a nivel app para un bypass inmediato sin tocar la BD.
