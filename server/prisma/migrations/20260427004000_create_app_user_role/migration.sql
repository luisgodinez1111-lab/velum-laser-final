-- Fase 1.4.a — Rol no-superuser para runtime de la app.
--
-- Por qué:
--   - Postgres bypassea RLS para superusers. Mientras la app conecte como
--     `postgres`, las policies son letra muerta.
--   - Separa privilegios: `postgres` solo para migrations y mantenimiento;
--     `app_user` para el día a día. Si un atacante consigue inyección SQL,
--     no puede hacer DDL.
--
-- Esta migración SOLO crea el rol y los GRANTs. La activación real (que la
-- app conecte como app_user) se hace cambiando DATABASE_URL en .env y
-- redeploy. Hasta entonces, el rol existe pero nadie lo usa — cero riesgo.
--
-- PORTABILIDAD (migración a Postgres gestionado, ej. Neon): un Postgres
-- gestionado no expone superusuario `postgres` ni permite setear GUCs custom
-- vía ALTER DATABASE/ROLE. Por eso:
--   - Si `app.bootstrap_password` no está seteado, se genera uno aleatorio
--     (app_user no se usa mientras RLS_ENFORCE=false; el password se rota al
--     activar RLS de verdad).
--   - DATABASE y FOR ROLE se resuelven dinámicamente (current_database /
--     current_user) en vez de hardcodear `velum` / `postgres`.

DO $$
DECLARE
  pwd  TEXT := NULLIF(current_setting('app.bootstrap_password', true), '');
  ownr TEXT := current_user;
  dbn  TEXT := current_database();
BEGIN
  IF pwd IS NULL THEN
    pwd := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    RAISE NOTICE 'app.bootstrap_password no seteado — app_user recibe un password aleatorio (sin uso mientras RLS_ENFORCE=false)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format('CREATE ROLE app_user LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', pwd);
    RAISE NOTICE 'Created role app_user';
  ELSE
    -- Portabilidad: en Postgres gestionado (Neon) un rol no-superuser NO puede
    -- hacer ALTER ROLE ... NOSUPERUSER/NOBYPASSRLS aunque el valor no cambie
    -- ("only roles with SUPERUSER may change the SUPERUSER attribute"). Como
    -- app_user ya existe con los atributos correctos del CREATE y su password
    -- no se usa (RLS_ENFORCE=false), NO lo alteramos — no-op idempotente.
    RAISE NOTICE 'Role app_user ya existe — sin cambios';
  END IF;

  -- ── Permiso de conexión sobre la DB actual (portable) ────────────────
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', dbn);

  -- ── Permisos sobre tablas/sequences FUTURAS ──────────────────────────
  -- Default privileges del rol que corre las migraciones (postgres en
  -- self-host, neondb_owner en Neon) → current_user, portable. Cada vez que
  -- ese rol cree una tabla nueva (prisma migrate), app_user recibe estos grants.
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user', ownr);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user', ownr);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_user', ownr);
END $$;

-- ── Permisos sobre schema y objetos EXISTENTES ────────────────────────
-- DML completo. NO DDL — app_user no debe poder ALTER/DROP/CREATE.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- ── Tabla _prisma_migrations: solo lectura ────────────────────────────
-- Prisma migrate deploy corre como el rol owner. La app no debe poder
-- modificar el historial de migraciones (es tarea de DBA, no de app).
REVOKE INSERT, UPDATE, DELETE ON _prisma_migrations FROM app_user;
GRANT SELECT ON _prisma_migrations TO app_user;
