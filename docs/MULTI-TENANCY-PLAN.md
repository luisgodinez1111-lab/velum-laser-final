# Plan de activación de Multi-Tenancy — VELUM OS

**Fecha:** 2026-07-10
**Objetivo:** convertir VELUM OS de "app de una clínica" a **SaaS multi-tenant vendible** — poder onboardear una 2ª, 3ª… clínica con **aislamiento de datos garantizado** (la clínica B nunca puede ver pacientes/citas/pagos de la clínica A).

> **Hallazgo clave:** la maquinaria ya está construida (~90%). Esto NO es "construir multi-tenancy" — es **activarla por etapas, con red de seguridad**. El riesgo real no es escribir código nuevo, es el cambio de "fail-open" (hoy) a "fail-closed" (aislado) sin romper flujos.

---

## Estado actual (lo que YA existe)

| Pieza | Estado | Dónde |
|---|---|---|
| Modelo `Tenant` (con billing SaaS: status trial, planTier, region, timezone) | ✅ | `schema.prisma:117` |
| `tenantId`/`clinicId` en **31 de 34 tablas** | ✅ | `schema.prisma` |
| Políticas **RLS aplicadas** (7 migraciones) con `FORCE ROW LEVEL SECURITY` | ✅ | `migrations/*_rls_*` |
| Helper `app_current_tenant_id()` (lee `current_setting('app.tenant_id')`) | ✅ | `migrations/…_rls_tenant_isolation` |
| Rol **`app_user`** (`NOSUPERUSER NOBYPASSRLS`) + GRANTs + default privileges | ✅ | `migrations/…_create_app_user_role` |
| Resolución de tenant por request (JWT → `runWithTenant` → AsyncLocalStorage) | ✅ | `middlewares/auth.ts`, `utils/tenantContext.ts` |
| `withTenantContext` (hace `SET LOCAL app.tenant_id` si `RLS_ENFORCE=true`) | ✅ | `db/withTenantContext.ts` |
| Flags de runtime `RLS_ENFORCE` + **kill-switch** `RLS_BYPASS_EMERGENCY` | ✅ | `utils/env.ts:159,165` |

### Por qué HOY no aísla (aunque todo existe)
1. **La app conecta como `postgres` (superuser)** → Postgres **bypasea RLS** para superusers. Las policies existen pero no se aplican.
2. **`RLS_ENFORCE=false`** → `withTenantContext` corre las queries sin el `SET LOCAL`.
3. **Las policies tienen fallback permisivo:** `USING (app_current_tenant_id() IS NULL OR "clinicId" = app_current_tenant_id())`. El `IS NULL OR` = "si no hay tenant seteado, deja pasar TODO". Es **fail-open** a propósito, para no romper mientras se activa.

Los 3 son intencionales (activación gradual). El plan los invierte con cuidado.

---

## Los agujeros REALES a cerrar (lo que falta)

| # | Gap | Impacto |
|---|---|---|
| A | **Rutas públicas sin auth** (custom-charge, leads, stripe-webhook) no resuelven tenant — no hay resolver por host/subdominio | Con RLS estricto, estas rutas quedarían fail-closed (0 filas) |
| B | **JWT debe llevar el tenant REAL del usuario** — hoy cae a `env.defaultClinicId` | Con 1 tenant "default" funciona; con 2 clínicas el token debe traer el tenant correcto |
| C | **Jobs/crons/workers** deben envolver su trabajo en `runWithTenant()` | Sin contexto → fail-closed bajo RLS estricto |
| D | **Costo de performance** de `withTenantContext` (tx interactiva + `SET LOCAL` = ~4 round-trips por query, retiene conexión pooled) | Caro contra Neon serverless (ver auditoría backend) |
| E | **Provisioning/onboarding** de una clínica nueva (crear Tenant + primer admin) | Hoy manual (`reset-admin`) |
| F | **Stripe por tenant** (cada clínica cobra a SUS pacientes) | Verificar si `AdminStripeSettings` ya es per-tenant |
| G | **Verificación de aislamiento** (test con 2 tenants: A no ve B) | Sin esto no hay garantía vendible |

---

## Estrategia: activación por etapas, siempre en STAGING primero

**Regla de oro:** cada etapa se prueba en una **branch de Neon (staging)** antes de tocar producción. El kill-switch `RLS_BYPASS_EMERGENCY=true` permite desactivar RLS en caliente (solo editar env + restart) si algo sale mal en prod. El paso irreversible-en-riesgo (quitar el fallback permisivo) va **al final**, tras validar todo lo demás.

### Etapa 0 — Preparación (bajo riesgo)
- Rotar el password de `app_user` (hoy es aleatorio/sin usar). Setearlo vía `app.bootstrap_password` o `ALTER ROLE app_user PASSWORD …`.
- Confirmar grants: `app_user` tiene SELECT/INSERT/UPDATE/DELETE + USAGE en sequences + default privileges. Correr una query de prueba conectado como `app_user`.
- Añadir `DIRECT_URL` (ya recomendado en Ola 1) — migraciones corren como **owner**, no como app_user.
- Crear branch de Neon para staging.

### Etapa 1 — Conectar como `app_user` con RLS activo PERO fallback permisivo (staging)
- `DATABASE_URL` → conexión como `app_user` (pooled, con `pgbouncer=true`).
- `RLS_ENFORCE=true`.
- El fallback permisivo **sigue activo** → si algún call-site olvida el contexto, deja pasar (no rompe). Objetivo de esta etapa: **validar que app_user tiene los grants correctos y que `withTenantContext` (SET LOCAL) funciona end-to-end**, sin exigir aún aislamiento estricto.
- Correr la suite completa (741 tests) + smoke de los flujos críticos apuntando a staging.

### Etapa 2 — Cerrar los agujeros de contexto (gaps A, B, C)
- **Rutas públicas (A):** implementar `resolveTenantFromHost` (subdominio → tenant) o, para recursos con dueño (custom-charge, lead), derivar el tenant del propio recurso ANTES de la query, y envolver en `runWithTenant({ source: "host" })`.
- **JWT (B):** asegurar que el token incluye el `tenantId` real del usuario (no el default). Migrar los usuarios existentes al tenant "default" explícito.
- **Jobs/crons (C):** auditar `workers/` y envolver cada unidad de trabajo en `runWithTenant()` (o `withExplicitTenant`) iterando por tenant.
- **Instrumentar:** loggear (warn) cada vez que una query corre con `app_current_tenant_id() IS NULL` → detectar call-sites sin contexto ANTES de quitar el fallback.

### Etapa 3 — Verificación de aislamiento (gap G)
- Seed de **2 tenants** de prueba (clínica A y B) con datos.
- Test de integración: autenticado como usuario de A, **NO** debe ver ningún dato de B (users, appointments, payments, documents, intakes). Cubrir cada tabla tenant-scoped.
- Confirmar 0 warnings de "tenant NULL" en los flujos ejercitados.

### Etapa 4 — 🔴 Quitar el fallback permisivo (fail-closed) — el paso crítico
- Migración que cambia las policies de `USING (app_current_tenant_id() IS NULL OR "clinicId" = …)` a `USING ("clinicId" = app_current_tenant_id())`.
- A partir de aquí: **sin contexto de tenant = 0 filas** (fail-closed). Es el aislamiento real.
- Desplegar SOLO tras Etapas 2-3 verdes y con el kill-switch listo. Monitorear de cerca.

### Etapa 5 — Performance (gap D)
- Medir el costo de la tx interactiva por query contra Neon. Opciones: agrupar operaciones por request en una sola tx, evaluar `SET` a nivel de sesión de conexión pooled, o un middleware que abra 1 tx por request en vez de por query.
- Ajustar `connection_limit` para el patrón transaccional.

### Etapa 6 — Onboarding + Stripe por tenant (gaps E, F) — habilita "vendible"
- Flujo de provisioning: crear Tenant + primer admin (self-serve o asistido).
- Stripe por tenant (Connect o config por clínica). Verificar/extender `AdminStripeSettings`.
- Resolución por subdominio en producción (`clinicaX.velumos.com` → tenant X) + certificados wildcard.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Quitar el fallback rompe un flujo olvidado → 0 filas en prod | Etapa 2 instrumenta warnings; Etapa 3 verifica; kill-switch `RLS_BYPASS_EMERGENCY=true` revierte en caliente |
| app_user sin algún grant → error en runtime | Etapa 1 valida grants en staging con la suite completa |
| Overhead transaccional degrada latencia | Etapa 5 dedicada a medir/optimizar antes de escalar |
| Migración de policies irreversible | Se prueba en branch de Neon; la policy anterior se puede recrear |

## Criterio de "hecho" (definición de vendible)
- ✅ La app conecta como `app_user` (NOBYPASSRLS) en prod.
- ✅ `RLS_ENFORCE=true`, fallback permisivo eliminado (fail-closed).
- ✅ Test de aislamiento verde: usuario de A no accede a NINGÚN dato de B.
- ✅ Rutas públicas y jobs resuelven tenant correctamente (0 warnings NULL).
- ✅ Flujo de onboarding de una clínica nueva + Stripe por tenant.
- ✅ Suite completa + E2E verdes contra la config multi-tenant.

## Orden recomendado
**Etapa 0-1 (staging) → 2 → 3 → 4 (prod, con kill-switch) → 5 → 6.**
No saltar a Etapa 4 sin 2-3 verdes. Todo en staging primero. El día que esto esté hecho, VELUM pasa de "la app de VELUM Laser" a "un producto que se vende a clínicas".
