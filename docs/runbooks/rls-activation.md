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
>
> **Estado (Fase 1.5 Slice A — completado, 2026-04-28):**
> - ✅ Migración `20260428000000_rls_child_tables_slice_a` aplicada en
>   producción. Agrega `tenantId` con FK + index + RLS + FORCE + policy
>   `tenant_isolation` con fallback permisivo en 8 tablas hijas:
>   `Membership`, `Payment`, `Document`, `MedicalIntake`,
>   `SessionTreatment`, `CustomCharge`, `Notification`, `AuditLog`.
> - ✅ Backfill verificado: 100% de filas existentes tienen
>   `tenantId='default'` (heredado vía JOIN al `User.clinicId`).
>   Para `AuditLog` se usa COALESCE(userId, actorUserId, targetUserId)
>   con fallback a `'default'` cuando los tres son NULL.
> - ✅ Schema.prisma actualizado con relación inversa en `Tenant` y
>   `tenantId String @default("default")` + `tenant Tenant @relation`
>   en cada modelo. `npx prisma validate` OK.
> - ✅ Aislamiento end-to-end verificado vía sanity SQL: como rol
>   `velumapp` con `app.tenant_id='X'`, ningún SELECT/INSERT cruza
>   tenants. WITH CHECK rechaza inserts con tenantId mismatch.
> - ✅ Test `rlsIsolation.test.ts` extendido con 16 casos (8 tablas
>   × 2 direcciones). Corre con `RLS_TEST_DATABASE_URL` apuntando a
>   postgres real; sin esa variable se skipea limpiamente.
> - ⚠️ **Deuda**: el `@default("default")` en Prisma permite que
>   callers no-tenant-aware sigan funcionando en single-tenant. Cuando
>   entre el 2do tenant, los `.create` de las 8 tablas deben pasar
>   `tenantId` explícito y el DEFAULT del DB debe eliminarse.
> - ⏳ **Pendiente Slices B/C**: tablas auth/identity (Profile,
>   RefreshToken, EmailVerificationToken, PasswordResetToken,
>   ConsentOtpToken, PasswordHistory, WhatsappOtp, DeleteOtp) y
>   marketing (Lead, MarketingAttribution). Ver sección final.
>
> **Estado (Fase 1.5 Slice B — completado, 2026-04-28):**
> - ✅ Migración `20260428001000_rls_child_tables_slice_b` aplicada en
>   producción. Mismo patrón que Slice A en 8 tablas auth/identity:
>   `Profile`, `RefreshToken`, `EmailVerificationToken`,
>   `PasswordResetToken`, `ConsentOtpToken`, `PasswordHistory`,
>   `WhatsappOtp`, `DeleteOtp`.
> - ✅ Backfill 100%: 3 Profiles + 5 RefreshTokens existentes →
>   `tenantId='default'`. Tokens corta-vida (vacíos en producción
>   actualmente) usan el DEFAULT al inserción. `DeleteOtp` backfilled
>   via `actorUserId`.
> - ✅ Schema.prisma actualizado, `prisma validate` OK, `tsc --noEmit`
>   0 errores.
> - ✅ Aislamiento end-to-end verificado vía sanity SQL en las 8 tablas
>   con rol `velumapp`.
> - ✅ Test `rlsIsolation.test.ts` extendido con 16 casos adicionales
>   Slice B (total: 5 originales + 16 Slice A + 16 Slice B = 37).
> - ⚠️ **Pre-auth flows revisitados**: login/register/refresh/reset
>   tocan `RefreshToken`/`EmailVerificationToken`/`PasswordResetToken`/
>   `User` SIN `tenantContext`. Hoy funcionan por el fallback permisivo
>   del policy. Cuando se elimine el fallback (Fase 2), estas rutas
>   necesitarán policies especiales (lookup por email/token sin tenant
>   en USING) o resolver el tenant antes via host/subdomain → JWT issue.
> - ⏳ **Pendiente Slice C**: marketing (Lead, MarketingAttribution) +
>   decisión sobre Agenda globals.
>
> **Estado (Fase 1.5 Slice C — completado, 2026-04-28):**
> - ✅ Migración `20260428002000_rls_child_tables_slice_c` aplicada en
>   producción. 9 tablas: `Lead`, `MarketingAttribution`, `AgendaPolicy`,
>   `AgendaCabin`, `AgendaTreatment`, `AgendaTreatmentCabinRule`,
>   `AgendaWeeklyRule`, `AgendaSpecialDateRule`, `AgendaBlockedSlot`.
> - ✅ **Decisión arquitectónica**: agenda pasa a multi-tenant. Cada
>   clínica tendrá su propio catálogo de cabinas, tratamientos, horarios
>   y bloqueos cuando entre el 2do tenant.
> - ✅ Cambios estructurales en uniques (no solo aditivos):
>   - `AgendaTreatment.code`        → `UNIQUE (tenantId, code)`
>   - `AgendaWeeklyRule.dayOfWeek`  → `UNIQUE (tenantId, dayOfWeek)`
>   - `AgendaSpecialDateRule.dateKey` → `UNIQUE (tenantId, dateKey)`
>   `agendaConfigService.ts` ajustado para usar la sintaxis compuesta
>   en upserts (`tenantId_dayOfWeek` / `tenantId_dateKey`), resolviendo
>   `tenantId` desde `getTenantId() ?? 'default'`.
> - ✅ Backfill 100% via JOIN al User para Lead/MarketingAttribution
>   (con COALESCE a 'default' cuando convertedUserId/userId NULL).
>   Agenda: backfill via DEFAULT 'default' en ADD COLUMN.
> - ✅ Schema.prisma actualizado, validado, regenerado, 0 errores TS.
> - ✅ Aislamiento end-to-end verificado vía sanity SQL en las 9 tablas.
> - ✅ Test `rlsIsolation.test.ts` extendido con 18 casos adicionales
>   Slice C (total: 5 originales + 16 A + 16 B + 18 C = 55 casos).
> - ⚠️ **Recovery durante migración**: el `DROP CONSTRAINT` original
>   falló porque Prisma viejo creó esos uniques como `CREATE UNIQUE
>   INDEX` (no como `ADD CONSTRAINT`). Fix aplicado: usar
>   `DROP CONSTRAINT IF EXISTS` + `DROP INDEX IF EXISTS` en cascada.
>   Migración rolled back con `prisma migrate resolve` y reaplicada
>   limpia. Patrón documentado para futuras migraciones Postgres.
>
> **🎯 Fase 1.5 completada — RLS denormalizado en 31 tablas:**
> - Root tables (4): User, Appointment, IntegrationJob, GoogleCalendarIntegration
> - Outbox + embeddings (2): OutboxEvent, MedicalIntakeEmbedding
> - Slice A datos clínicos/financieros (8)
> - Slice B auth/identity (8)
> - Slice C marketing + agenda (9)
>
> El siguiente paso es la **activación real (paso 5 de este runbook)**:
> cambiar `DATABASE_URL` al rol `velumapp` (no-superuser, FORCE RLS) y
> setear `RLS_ENFORCE=true`. Comportamiento runtime hoy: idéntico al
> pre-fase porque el fallback permisivo del policy aplica cuando
> `app.tenant_id` no está seteado.
>
> **Estado (ACTIVACIÓN — completada, 2026-04-28):**
> - ✅ `velumapp` ya era el rol de conexión runtime (Fase 1.4.a). Solo
>   faltaba flippear el flag.
> - ✅ `RLS_ENFORCE=true` añadido a `server/.env`. La app ahora envuelve
>   cada `withTenantContext()` en transacción con `set_config('app.tenant_id',
>   ${tenantId}, true)`. Las policies filtran por tenant en todas las
>   queries autenticadas.
> - ✅ API + worker recreados con imagen fresh (incluye agendaConfigService
>   con sintaxis compuesta `tenantId_dayOfWeek` / `tenantId_dateKey`).
> - ✅ Smoke tests post-activación: `/api/health` OK · login flow
>   (rechazo correcto de credenciales inválidas con `recordLoginFailure`
>   actualizando contador) · containers healthy. Logs limpios excepto
>   P2025 esperado de smoke test con email inexistente.
> - ✅ Pre-auth flows siguen funcionando vía fallback permisivo del
>   policy (sin tenantContext → app.tenant_id NULL → policy permite).
> - ⚠️ **Rollback documentado < 60s**: comentar `RLS_ENFORCE=true` en
>   `server/.env` y `docker compose restart api worker`. RLS sigue
>   habilitado pero `withTenantContext` se vuelve no-op.
>
> **Estado (ROLLBACK + RE-ACTIVACIÓN con red de seguridad — 2026-04-28):**
> - ⚠️ Rollback inicial ejecutado tras reporte de "admin no entra al
>   panel después de login". **La causa NO era RLS** — era el bundle
>   frontend stale (`admin-settings-C6GiDnsN.js`) con redirect a
>   `/#/login` (ruta inexistente → NotFound). `apiClient.ts` se había
>   modificado en commit `f5b5a35` a `/#/agenda?mode=login` pero el
>   `dist/` nunca se reconstruyó.
> - ✅ Bundle reconstruido (`npm run build` + `docker compose build nginx`
>   + recreate). Verificado en ambos: Docker propio (velumlaser.com) y
>   Vercel (y-pi-puce.vercel.app) sirven bundle nuevo con redirect
>   correcto.
> - ✅ Red de seguridad agregada antes de re-activar (commit `15a91f3`):
>   - `RLS_BYPASS_EMERGENCY` env var → kill switch sin rebuild
>     (`server/src/db/withTenantContext.ts:42-49`)
>   - `rlsErrorLogger` middleware → tag `[RLS-ERROR]` en logs +
>     contador in-memory 5 min
>     (`server/src/middlewares/rlsErrorLogger.ts`)
>   - `/api/v1/health/detailed` → bloque `rls.{enforced, bypassEmergency,
>     errorsLast5Min, errorsByPath, errorsBySqlstate}`
>   - `scripts/rls-smoke-test.sh` → valida endpoints clave con sesión admin
> - ✅ `RLS_ENFORCE=true` re-activado, API+worker recreados, login admin
>   verificado funcional con RLS activo.

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

## Deuda explícita pendiente — Slices B y C

**Slice A completo (2026-04-28).** Las 8 tablas con datos clínicos/financieros
ya tienen RLS denormalizado: `Membership`, `Payment`, `Document`,
`MedicalIntake`, `SessionTreatment`, `CustomCharge`, `Notification`,
`AuditLog`.

**Slice B — auth/identity (completado 2026-04-28):**
`Profile`, `RefreshToken`, `EmailVerificationToken`, `PasswordResetToken`,
`ConsentOtpToken`, `PasswordHistory`, `WhatsappOtp`, `DeleteOtp`. Aislamiento
verificado. Pre-auth flows siguen funcionando por el fallback permisivo del
policy — su policy especializada queda como deuda Fase 2.

**Slice C — marketing + agenda multi-tenant (completado 2026-04-28):**
- `Lead`, `MarketingAttribution` — backfill via convertedUserId/userId con
  fallback `'default'`.
- `AgendaPolicy`, `AgendaCabin`, `AgendaTreatment`, `AgendaTreatmentCabinRule`,
  `AgendaWeeklyRule`, `AgendaSpecialDateRule`, `AgendaBlockedSlot` →
  multi-tenant. Cada clínica con su propio catálogo cuando entre el
  2do tenant. Uniques globales reemplazados por compuestos `[tenantId, X]`.

**Deuda transversal (Slices A/B/C):**
- Eliminar `DEFAULT 'default'` en DB y hacer `tenantId` requerido en Prisma
  cuando entre el 2do tenant. Refactorear los `.create` para pasar
  `tenantId: requireTenantId()` explícito.
- Resolver tenantId en agendaConfigService desde el contexto en lugar de
  `getTenantId() ?? 'default'` cuando entre el 2do tenant.
- Pre-auth flows necesitarán policy especializada cuando se elimine el
  fallback permisivo (lookup por email/token sin tenant).
- `claimNextPendingJob()` en integrationJobService.ts deberá iterar por
  tenants con `withExplicitTenant()`.

Fase 1.5 completa — 31 tablas con `tenant_isolation` en producción.
Siguiente paso: paso 5 de este runbook (activación real con `velumapp`).
