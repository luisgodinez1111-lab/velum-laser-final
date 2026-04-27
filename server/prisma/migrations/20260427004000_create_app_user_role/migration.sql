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
-- Password: leído desde la variable de sesión `app.bootstrap_password` que
-- el operador setea ANTES de correr la migración. La migración falla en
-- voz alta si no se setea — preferimos boot ruidoso a default inseguro.

DO $$
DECLARE
  pwd TEXT := NULLIF(current_setting('app.bootstrap_password', true), '');
BEGIN
  IF pwd IS NULL THEN
    RAISE EXCEPTION 'Pasar password vía: SET app.bootstrap_password = ''<password-fuerte>''; antes de aplicar esta migración';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format('CREATE ROLE app_user LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', pwd);
    RAISE NOTICE 'Created role app_user';
  ELSE
    EXECUTE format('ALTER ROLE app_user WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', pwd);
    RAISE NOTICE 'Updated role app_user';
  END IF;
END $$;

-- ── Permisos sobre la DB y schema ─────────────────────────────────────
GRANT CONNECT ON DATABASE velum TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- ── Permisos sobre tablas y sequences existentes ──────────────────────
-- DML completo. NO DDL — app_user no debe poder ALTER/DROP/CREATE.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- ── Permisos sobre tablas/sequences FUTURAS ───────────────────────────
-- Cada vez que `postgres` cree una tabla nueva (vía prisma migrate),
-- app_user automáticamente recibe estos grants. Sin esto, cada migración
-- requeriría un GRANT manual.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_user;

-- ── Tabla _prisma_migrations: solo lectura ────────────────────────────
-- Prisma migrate deploy corre como postgres. La app no debe poder modificar
-- el historial de migraciones (eso es claro elemento de DBA, no de app).
REVOKE INSERT, UPDATE, DELETE ON _prisma_migrations FROM app_user;
GRANT SELECT ON _prisma_migrations TO app_user;
