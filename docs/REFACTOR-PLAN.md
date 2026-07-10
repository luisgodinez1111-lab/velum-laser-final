# Plan de Refactorización — VELUM OS

**Fecha:** 2026-07-10
**Contexto:** con el sistema 100% operativo (login, panel admin, OTP, flujos de pago), se hizo una auditoría fresca de 4 dimensiones —código muerto, performance frontend, performance backend/DB, y arquitectura/duplicación— para subir el código a nivel SaaS **sin reescrituras**. Este plan extiende las Etapas 1-5 del `SAAS-HARDENING-2026-07-09.md` con datos medidos.

> **Filosofía (regla de la casa):** `terminar > rediseñar` · `quirúrgico > masivo` · `preguntar > asumir`. Nada aquí se ejecuta a ciegas: cada ola va en su propia rama, con tests, y se despliega verificada.

---

## Veredicto general

El sistema **no es tierra quemada** — está sano para su tamaño:
- Backend en `strict`, con índices compuestos bien pensados y casi todos los listados paginados.
- `manualChunks` + lazy routes ya configurados en el frontend.
- Dominio de agenda bien modularizado (10 services).
- Código muerto escaso: **sin** bloques comentados grandes ni ramas `if(false)`.

Los problemas reales están **concentrados y son quirúrgicos**. Se priorizan por ROI (impacto ÷ esfuerzo ÷ riesgo).

### Baseline medido
| Métrica | Valor |
|---|---|
| Líneas (front+back núcleo) | ~42,000 |
| God-files | Admin 2129 · Agenda 1829 · Dashboard 1813 (5,771 líneas en 3 archivos) |
| `any` frontend / backend | **101** / 3 |
| `strict` mode | backend ✅ / **frontend ❌** |
| Chunk más pesado | `admin-settings` 332 KB (103 KB gz) |
| Vulnerabilidades | root 12 (2 high en prod) · server 61 (17 high, 2 critical) |

---

## 🌊 Ola 1 — Quick wins (alto impacto · bajo esfuerzo · bajo riesgo)

Objetivo: máximo retorno con riesgo casi nulo. Una sola rama, con tests.

| # | Item | Evidencia (archivo:línea) | Impacto | Esfuerzo |
|---|------|---------------------------|---------|----------|
| 1 | **`pgbouncer=true` + `directUrl` para Neon** — Prisma requiere el flag con el endpoint pooled (`-pooler`); sin él, errores `prepared statement "s0" already exists` bajo carga | `server/src/db/prisma.ts:7-9`, `server/prisma/schema.prisma:5-8` | 🔴 Alto (prod) | Bajo |
| 2 | **Lazy-load de settings del admin** — hoy se importan estáticos y anulan el `React.lazy`, arrastrando ~130 KB gz al entrar a `/admin` aunque no abras Stripe/WhatsApp/Users | `pages/Admin.tsx:47,49,50,55,58` | Alto | Bajo-medio |
| 3 | **Dashboard: 5 fetch secuenciales → `Promise.all`** — hoy la latencia de carga es la suma de 5 round-trips independientes | `pages/Dashboard.tsx:328-364` | Alto | Bajo |
| 4 | **Fix bug de drift `apptStatusLabel`** — el mismo estado de cita se pinta con distinto color y texto ("No show" vs "No asistió") según qué archivo importe la pantalla | `pages/adminUtils.ts:5-37` vs `pages/adminShared.tsx:10-42` | 🐛 Alto | Bajo |
| 5 | **Borrar código muerto seguro** — `nodemailer` + `@types/nodemailer` (sin usar, elimina 1 vuln high), `server/src/workers/cronLock.ts` (huérfano), ~14 símbolos exportados 100% muertos | ver Anexo A | Medio | Bajo |
| 6 | **Consolidar duplicados** — `formatMoney` ×5 → `adminShared`; `validatePasswordStrength` ×4 → módulo compartido; regex email ×2 | ver Anexo B | Medio | Bajo |
| 7 | **Diferir init de Sentry** — hoy corre síncrono antes de montar React | `index.tsx:1-4`, `services/sentry.ts:11` | Medio | Bajo |
| 8 | **Fix doble fetch de agenda del día** — se pide en `loadData` y otra vez en un efecto separado en el mount | `pages/admin/hooks/useAdminData.ts:66` + `pages/Admin.tsx:378-391` | Medio | Bajo |
| 9 | **`connection_limit` para PgBouncer** — hoy 10 hardcodeado por instancia; con pooler conviene bajarlo (1-5) y dejar que multiplexe | `server/src/db/prisma.ts:9` | Medio | Bajo |

---

## 🌊 Ola 2 — Performance & tipado (esfuerzo medio)

| # | Item | Evidencia | Impacto | Esfuerzo |
|---|------|-----------|---------|----------|
| 1 | **`bcryptjs` (JS puro, cost 12) → `bcrypt` nativo / `@node-rs/argon2`** — bloquea el event loop ~200-300ms por login; serializa el server bajo concurrencia | `server/src/utils/auth.ts:17-18` | 🔴 Alto | Medio |
| 2 | **`select` en queries con PHI grande** — traen `signatureImageData` (Text) y JSON sin necesitarlos | `server/src/controllers/v1MedicalIntakeController.ts:107`, `intakeAdminController.ts:17`, `userAdminController.ts:53,61` | Medio | Bajo |
| 3 | **Paginación faltante** — `getAppointments` sin `take` cuando el admin omite fechas; `listDocuments` sin `take`/`select` | `v1AppointmentController.ts:377-381`, `documentController.ts:36` | Medio | Bajo |
| 4 | **`React.memo`/`useCallback` + aislar reloj de 60s** — hoy cero memo; el `setInterval` re-renderiza todo el Dashboard cada minuto | `pages/Dashboard.tsx:84-98`; global | Alto | Medio |
| 5 | **Frontend `strict` mode** — activar `noImplicitAny` → `strict`; atacar los 101 `any` (hotspots: Dashboard 22, Admin 14, AdminStripeSettings 12) | `tsconfig.json` | Alto | Medio |
| 6 | **Cache/dedupe de GET en apiClient** — hoy solo dedupe del refresh; slots de agenda se refetchan al alternar fechas | `services/apiClient.ts:27` | Medio | Medio |
| 7 | **Remediar vulnerabilidades** — subir `react-router-dom` (única high que afecta el bundle de prod) + actualizar/pin del stack OpenTelemetry (concentra la mayoría de high/critical del server) | `npm audit` | Alto (seg.) | Medio |
| 8 | **Memoizar derivaciones del Dashboard** — sesiones/pagos/citas se derivan en JSX en cada render | `pages/Dashboard.tsx` (solo `passwordChecks` memoizado) | Medio | Bajo |

---

## 🌊 Ola 3 — Estructural (esfuerzo alto · una por rama/PR · con tests)

| # | Item | Evidencia | Nota |
|---|------|-----------|------|
| 1 | **Partir god-files** — extraer cada sección a componente lazy y la lógica pura a hooks testeables. Admin: `useAdminAnalytics` (mover `Admin.tsx:604-723`); secciones `SociasTab/ExpedientesTab/AgendaTab/...`. Dashboard y Agenda igual | Admin 2129, Agenda 1829, Dashboard 1813 | Empezar por Admin (ya tiene `useAdminData`) |
| 2 | **Adoptar `typedApi` + tipos OpenAPI generados** ✅ *(decidido)* — migrar consumidores de `apiClient`+`apiTypes.ts` (a mano) hacia `typedApi` + `__generated__/api-types.ts`; correr `codegen:check` en CI. Elimina ~1570 líneas de tipos duplicados y da tipado real front↔back | `services/typedApi.ts` (0 consumidores hoy), `services/apiTypes.ts` (167 LOC a mano) | Incremental, endpoint por endpoint |
| 3 | **Partir god-services** — `stripeWebhookService.ts` (1045) por tipo de evento; `emailService.ts` (821) separar plantillas de envío | — | Riesgo medio (toca pagos) |
| 4 | **Mover lógica de negocio de controllers a services** | `v1AppointmentController.ts` (814), `adminAccessController.ts` (633) | — |
| 5 | **Adoptar design system** — borrar `components/Button.tsx` (legacy) y migrar a `ui/Button`; luego los 232 `<button>` crudos, 93 `<input>`, 13 modales a mano | 2 `Button` coexisten; 6 usos de `ui/Button` | Incremental, riesgo bajo (visual) |
| 6 | **Estandarizar `AppError` + `response.ts`** — hoy AppError en 5/31 controllers, 21 `throw new Error` crudos (caen a 500); helpers `ok/created/paginated` con 6 usos vs 317 `res.json` | `server/src/utils/AppError.ts`, `response.ts` | Riesgo medio (cambia códigos HTTP) |
| 7 | **Endurecer CI gates** — agregar `eslint-plugin-react-hooks/rules-of-hooks` (habría atrapado el crash #310), `codegen:check`, umbrales de coverage. Renombrar los 17 archivos de ruta `*Routes` a `v1*` para eliminar la falsa señal de dualidad | `.github/workflows/ci.yml` | Bajo |

---

## Decisiones

- ✅ **`typedApi`: ADOPTARLO** (Ola 3 #2). No se borra; se migra el front hacia él.
- ⏳ **Rutas legacy sin consumidor** — candidatas a borrar, PENDIENTE tu confirmación de que NO se llaman desde landing/marketing externos al repo:
  - `POST /membership/change-plan`, `POST /membership/cancel` (`membershipRoutes.ts:8-9`)
  - `PUT /users/me/profile` legacy (`userRoutes.ts:8`) — el front usa `/v1/users/me/profile`
  - `POST /documents/upload` (`documentRoutes.ts:33`)
  - `POST /v1/leads` duplicado + `GET /admin/marketing/events` duplicado (`v1LeadRoutes.ts:8,11`) — **`/leads` es captura pública**, confirmar antes de tocar

---

## Lo que NO es problema (para no gastar esfuerzo)

- La API **ya es v1 de facto** (93% de los paths; solo integrations/webhooks quedan sin versionar). La "dualidad legacy vs v1" es solo **nomenclatura de archivos**, no deuda de API.
- El dominio **agenda ya está bien modularizado**.
- El **env del frontend ya está centralizado** (`apiClient.ts:3`).
- Las **derivaciones pesadas de Admin ya están memoizadas** (`analytics`, `planBreakdown`, `filteredMembers`, etc.).

---

## Anexos (evidencia detallada)

### Anexo A — Código muerto seguro de eliminar
- **Deps:** `nodemailer` + `@types/nodemailer` (cero imports; el código usa `resend`). Elimina la vuln `nodemailer <=9.0.0` (high).
- **Archivos huérfanos:** `server/src/workers/cronLock.ts` (70 líneas, cero importadores).
- **Símbolos 100% muertos:** `context/ThemeContext.tsx:72` `useTheme`; `services/stripeService.ts:26` `checkSubscriptionStatus`; `services/sentry.ts:93` `isSentryEnabled`; `services/apiTypes.ts` tipos `NotificationListResponse/UnreadCountResponse/AuditLogListResponse/PaymentListResponse/UserProfile`; `server/src/utils/sentry.ts:99,103`; `telemetry.ts:129`; `circuitBreaker.ts:73` `stripeCircuit`; `withTenantContext.ts:66` `withExplicitTenant`; `stripePlanCatalogService.ts:20` `invalidatePlanCatalogCache`; `metricsService.ts:31` `setGauge`.
- **Cuidado (andamiaje futuro, no borrar sin decidir):** `server/src/utils/outbox.ts` (`emitOutbox`, referenciado por TODO Fase 1.2.c); `services/__generated__/api-types.ts` (se conserva al adoptar typedApi).

### Anexo B — Duplicaciones a consolidar
- `validatePasswordStrength` ×4: `server/src/utils/auth.ts:21` (canónica), `scripts/reset-admin.ts:40`, `components/ForcePasswordChange.tsx:9`, `components/PasswordInput.tsx:19`.
- `formatMoney` (MXN) ×5: `pages/adminShared.tsx:3` (canónica), `AdminFinanzasSection.tsx:8`, `AdminKPIsSection.tsx:7`, `AdminPagosSection.tsx:8`, backend `paymentReminderService.ts:18`.
- `formatDate` ×3 distintas: `appointmentReminderService.ts:43`, `paymentReminderService.ts:15`, `settings/AgendaIntegrations.tsx:20`.
- Regex email ×2: `server/src/utils/strings.ts:5`, `components/AdminCreatePatientDrawer.tsx:95`.
- Mapeos de estado ×2 (con drift): `pages/adminShared.tsx` vs `pages/adminUtils.ts`.

### Anexo C — Backend infra / Neon
- `pgbouncer=true` ausente en la URL pooled (`db/prisma.ts:7-9`).
- `directUrl` ausente en `schema.prisma:5-8` (migraciones deberían ir por conexión directa).
- Wrapper RLS transaccional (`db/withTenantContext.ts:53-58`): al activar `RLS_ENFORCE=true` (Etapa 4 del hardening), cada query se envuelve en `$transaction` interactivo (~4 round-trips) y retiene la conexión pooled — **evaluar antes de activar RLS**.

---

## Orden recomendado

**Ola 1 → deploy → Ola 2 → deploy → Ola 3 (una por PR).** El `pgbouncer` (Ola 1 #1) es semi-urgente: puede estar causando errores intermitentes en producción bajo carga.
