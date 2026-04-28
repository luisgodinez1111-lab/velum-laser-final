# Runbook — Activación real de RLS

> **Estado actualizado (Fase 1.4.a — completado):**
> - Policies RLS creadas con fallback permisivo (Fase 0.4)
> - Helper `withTenantContext()` y feature flag `RLS_ENFORCE` (Fase 0.4)
> - La app **ya** conecta como `velumapp` (no-superuser, no-bypassrls)
> - `FORCE ROW LEVEL SECURITY` aplicado en las 4 tablas root (Fase 1.4.a) —
>   antes el OWNER (`velumapp`) bypaseaba las policies por defecto de Postgres
> - Rol `app_user` adicional creado como redundancia/preparación
> - Sanity check intra-migración verificó: sin contexto ve todo, con tenant
>   inexistente ve 0
>
> **Comportamiento runtime hoy:** idéntico al pre-fase. La app NO setea
> `app.tenant_id`, así que el fallback permisivo aplica y todas las queries
> devuelven todo. Cero degradación.
>
> **Estado (Fase 1.4.b — completado):**
> - ✅ Test de aislamiento automatizado en `tests/rlsIsolation.test.ts` —
>   garantiza que policies + FORCE filtran correctamente cuando
>   `app.tenant_id` está seteado. Corre contra postgres real (no mock).
> - ✅ Refactor masivo completado: 147 callsites en 37 archivos sobre
>   `User`/`Appointment`/`IntegrationJob`/`GoogleCalendarIntegration`
>   envueltos en `withTenantContext()`. Ejecutado en 10 módulos
>   (M1 Auth → M10 Misc) con patrón Reader→Fixer→Verifier por módulo
>   más Verifier global cross-codebase. 745 tests verde en cada paso.
> - ✅ 3 transacciones reemplazadas por `withTenantContext` preservando
>   atomicidad (createUser, createPatient, deleteMyAccount).
> - ⚠️ **Excepción documentada**: `services/integrationJobService.ts`
>   `claimNextPendingJob()` mantiene `prisma.$transaction` por
>   atomicidad de claim contra race condition entre workers. Cuando
>   entre 2do tenant, deberá iterar por tenants con
>   `withExplicitTenant()` — deuda explícita Fase 2.
> - ⚠️ **Pre-auth flows** (login, register, refresh, reset, verify)
>   envueltos pero corren sin `tenantContext`. Cuando RLS_ENFORCE=true,
>   las policies actuales (fallback permisivo) los dejan funcionar.
>   Cuando se elimine el fallback, esos flujos necesitarán policies
>   especiales (permitir lookup por email para login). Deuda Fase 2.

---

## Pre-condiciones

- [ ] Backup-test verde el día anterior (`scripts/db-restore-test.sh` exit 0).
- [ ] Ventana baja de tráfico acordada con el equipo.
- [ ] Rollback plan ensayado: revertir `DATABASE_URL` a usuario `postgres`.

## Pasos

### 1. Crear rol `app_user` (idempotente)

```sql
-- Conectado como postgres
DO $$
DECLARE
  pwd TEXT := current_setting('app.bootstrap_password', true);
BEGIN
  IF pwd IS NULL OR pwd = '' THEN
    RAISE EXCEPTION 'Pasar password vía: SET app.bootstrap_password = ''<secret>'';';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_user') THEN
    EXECUTE format('CREATE ROLE app_user LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', pwd);
  ELSE
    EXECUTE format('ALTER ROLE app_user WITH PASSWORD %L NOSUPERUSER NOBYPASSRLS LOGIN', pwd);
  END IF;
END $$;

-- Permisos sobre tablas existentes
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- Permisos sobre tablas y secuencias futuras (las que cree postgres)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
```

### 2. Configurar dos URLs en el API

`postgres` para migrations y mantenimiento, `app_user` para runtime.

```env
# server/.env
DATABASE_URL=postgresql://app_user:<password>@postgres:5432/velum?schema=public
DATABASE_URL_MIGRATIONS=postgresql://postgres:<password>@postgres:5432/velum?schema=public
RLS_ENFORCE=true
```

`scripts/start.sh` debe usar `DATABASE_URL_MIGRATIONS` para `prisma migrate deploy`
y `DATABASE_URL` para el server.

### 3. Refactor de callers que tocan tablas con RLS

Toda query a `User`, `Appointment`, `IntegrationJob`, `GoogleCalendarIntegration`
debe pasar por `withTenantContext`:

```ts
// Antes
const users = await prisma.user.findMany({ where: ... });

// Después
const users = await withTenantContext((tx) => tx.user.findMany({ where: ... }));
```

Para crons que iteran tenants:

```ts
const tenants = await prisma.tenant.findMany({ where: { status: 'active' } });
for (const t of tenants) {
  await withExplicitTenant(t.id, (tx) => /* trabajo del cron */);
}
```

### 4. Test de aislamiento (no negociable)

Crear `server/tests/rls.test.ts` que:
1. Crea un segundo `Tenant` con `id='test-tenant-2'` y un `User` en él.
2. Ejecuta `withExplicitTenant('default', tx => tx.user.findMany())` y verifica
   que NO ve users de `test-tenant-2`.
3. Ejecuta `withExplicitTenant('test-tenant-2', ...)` y verifica que NO ve los
   8 users de `default`.
4. Limpia.

Sin este test, RLS puede romperse en cualquier refactor sin que nadie note.

### 5. Activación

```bash
# 1) Setear password en Postgres
docker exec velum-laser-final-postgres-1 psql -U postgres -d velum \
  -v "ON_ERROR_STOP=1" \
  -c "SET app.bootstrap_password = '<password-fuerte>'" \
  -f /tmp/create_app_user.sql

# 2) Actualizar .env del API con las dos URLs
# 3) Rebuild + redeploy
docker compose build api && docker compose up -d --no-deps api

# 4) Verificar
curl -sfk https://localhost/api/health
docker compose logs api --tail 30 | grep -i error  # debe estar vacío
```

### 6. Smoke test post-activación

- Login con admin → ver dashboard
- Crear cita → ver en agenda
- Listar pacientes → contar coincide con prod
- Logs sin `permission denied` ni `must be owner of`

### 7. Rollback (< 60s)

Si algo se rompe:

```bash
# Editar server/.env: DATABASE_URL ← URL con postgres user
docker compose up -d --no-deps api
```

RLS sigue habilitado pero `postgres` lo bypassa → comportamiento pre-Fase 1.

---

## Riesgos conocidos

| Riesgo | Mitigación |
|--------|-----------|
| Query falta `withTenantContext` → no devuelve datos | Test de aislamiento (paso 4) + grep CI sobre `prisma.user`/`prisma.appointment` directos |
| Cron iterando tenants olvida `withExplicitTenant` | Linter/grep CI sobre crons |
| Migration intenta correr como `app_user` y falla | Doble URL (paso 2), CI test de `prisma migrate status` con cada URL |
| `connection_limit=10` se duplica al doble pool | Reducir a 7-8 en runtime, dejar 2-3 para migrations |

---

## Deuda explícita pendiente (Fase 1.5)

RLS solo cubre `User`, `Appointment`, `IntegrationJob`, `GoogleCalendarIntegration`.
Las tablas hijas (`Payment`, `MedicalIntake`, `SessionTreatment`, `Document`,
`CustomCharge`, `Membership`, `Profile`, `Notification`, `AuditLog`...) NO
tienen RLS — su aislamiento depende de scoping vía JOIN al User.

Plan: migración 0.5/1.0 que añade `tenantId` denormalizado a esas tablas con
backfill desde `User.clinicId`, FK al Tenant, índice, y la misma policy
`tenant_isolation`. Es trabajo mecánico pero invasivo (toca ~20 modelos).
