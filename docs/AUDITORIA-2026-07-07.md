# Auditoría integral de código — VELUM OS

**Fecha:** 2026-07-07
**Alcance:** ~55,500 líneas TS/TSX en 342 archivos. 6 dimensiones auditadas en paralelo: [SEC] seguridad, [BE] backend, [DB] datos/Prisma, [FE] frontend, [OPS] infraestructura, [ARCH]/[QA] arquitectura y tests.
**Metodología:** análisis estático con evidencia textual (archivo:línea) + sondas read-only al dominio de producción. Ningún hallazgo especulativo: todo confirmado leyendo el código real.

---

## Veredicto ejecutivo

El núcleo de ingeniería es **notablemente sólido** (auth, webhooks Stripe, outbox, hardening, suite de tests backend), pero el sistema tiene **un incidente activo de infraestructura** (el dominio de producción no puede hablar con su API), **dos bugs críticos de dinero** y **una capa de email que falla en silencio absoluto**. La asimetría dominante: backend ~8.5/10, frontend ~5/10.

---

## 🔴 CRÍTICOS

### C1. [OPS] La API es inalcanzable desde el dominio de producción — incidente activo
- **Archivo:** `vercel.json:1-18` (sin rewrites) · `services/apiClient.ts:3`
- **Evidencia (verificada 2026-07-07):** `velumlaser.com` → 200 `server: Vercel` (deploy del 2-jul); el bundle desplegado hornea `"https://velumlaser.com/api"`; `GET /api/health` y `/api/v1/health` → **404** `x-vercel-error: NOT_FOUND`; `api.velumlaser.com` **sin registro DNS**.
- **Impacto:** desde el dominio público, TODA llamada de API (login, agenda, pagos, checkout) muere en 404 en el edge de Vercel. El cutover de MIGRATION.md (pasos 7-8: DNS de api + repunte de webhooks Stripe/Google) quedó a medias.
- **Fix:** decidir backend canónico (Render o VPS); crear `api.velumlaser.com` o rewrite `/api/*` en vercel.json; rebuild del front con `VITE_API_URL` correcto; ejecutar el checklist del paso 9 de MIGRATION.md (login, upload R2, webhook Stripe 200).

### C2. [DB] Unidades de dinero mezcladas en `Payment.amount` — webhook escribe pesos, lectores asumen centavos
- **Archivo:** `server/src/services/stripeWebhookService.ts:123-127,675,700,792` · `server/src/controllers/v1PaymentController.ts:168`
- **Evidencia:** `centsToMajor(session.amount_total)` en el único writer de Payment; el export CSV hace `(p.amount / 100).toFixed(2)`. `CustomCharge.amount` documenta centavos, Payment recibe pesos.
- **Impacto:** el CSV "Monto (MXN)" reporta 100× menos ($1,500 → "15.00"). Peor: un monto con centavos no exactos (1500.5) rechaza el Float en campo `Int` → el catch de `upsertPaymentRecord` solo loguea → **pago real no registrado y Stripe recibe 200** (no reintenta).
- **Fix:** convención única (centavos `Int` en todo el dominio), quitar `centsToMajor` de los writes a Payment, migración de datos para filas existentes, y re-lanzar en fallo de `upsertPaymentRecord`.

### C3. [DB/SEC] Seed con contraseñas hardcodeadas ya ejecutado en producción
- **Archivo:** `server/prisma/seed.ts:51,61-83` · `render.yaml:133-135`
- **Evidencia:** `staff@velum.mx`, `system@velum.mx`, `member@velum.mx` con `"ChangeMe123456!"` sin override por env ni `mustChangePassword`; render.yaml confirma "el seed inicial ya corrió en producción".
- **Impacto:** 3-4 cuentas (incluida una `staff` con acceso a expedientes y una `system`) con credencial pública en el repo, probablemente vivas en producción.
- **Fix:** **rotar hoy** esas cuentas en la DB viva; exigir contraseñas por env sin fallback (fallar el seed si faltan); bloquear cuentas demo cuando `NODE_ENV=production`.

### C4. [OPS] Backups de Postgres rotos o inexistentes
- **Archivo:** `deploy/backup-postgres.sh:16` · `scripts/backup-db.sh:12`
- **Evidencia:** el script principal usa `DB_USER="velumapp"` — rol que no existe (los reales son `postgres` y `app_user`) → `pg_dump` falla. Dos scripts solapados con retenciones distintas, ambos escriben al MISMO host (sin offsite). Si la DB ya vive en Neon, ninguno aplica y no hay alternativa en el repo.
- **Impacto:** sistema médico en producción con backup posiblemente fallando en silencio o inexistente post-migración. Pérdida del host = pérdida de datos + backups juntos.
- **Fix:** confirmar qué crontab corre en el VPS; corregir `DB_USER`; añadir copia offsite (R2 vía rclone); si Neon es el destino, `pg_dump` externo programado + verificar ventana PITR del plan.

### C5. [BE] El SDK de Resend nunca lanza — todos los emails pueden fallar en silencio absoluto
- **Archivo:** `server/src/services/emailService.ts:18,35-46`
- **Evidencia:** Resend 6.9.3 retorna `{ data, error }` y **jamás lanza**; `sendWithResilience` hace `withRetry(() => client.emails.send(payload))` y ningún archivo inspecciona `.error` (0 matches). La "degradación grácil" del commit 69afc11 (`new Resend(key || "re_unconfigured")`) convierte una key faltante en 401 permanente e invisible.
- **Impacto:** `withRetry` nunca reintenta, el circuit breaker nunca abre — toda la resiliencia es código muerto. `appointmentReminderService.ts:100-124` marca `reminderSentAt` tras envíos posiblemente fallidos; `adminAccessController.ts:480-488` responde éxito con OTP nunca entregado; `userAdminController.ts:305` marca `inviteEmailSent = true` falsamente.
- **Fix (~10 líneas, impacto sistémico):** desestructurar `const { error } = await client.emails.send(...)` y `throw` si `error` (reactiva retry + breaker + logs); short-circuit con `logger.warn` cuando falte la key (patrón que ya usa `notificationEmailService.ts:95`); loguear al boot qué `RESEND_KEY_*` faltan.

### C6. [FE] Cualquier 401 redirige al login — expulsa visitantes anónimos del sitio público
- **Archivo:** `services/apiClient.ts:129-140` · `context/AuthContext.tsx:58-71`
- **Evidencia:** tras refresh fallido: `window.location.replace('/#/agenda?mode=login')`. AuthContext al montar llama `verifySession()` → `/users/me` → 401 sin cookie → refresh 401 → redirect.
- **Impacto:** un visitante anónimo que abre `/#/` (home marketing) o `/#/memberships` es auto-navegado a la pantalla de login. El funnel público de captación queda inaccesible. Además, cualquier 401 en medio de sesión hace hard-redirect perdiendo el estado de la página.
- **Fix:** `skipAuthRedirect` en `verifySession` y llamadas de páginas públicas, o redirigir solo cuando había usuario autenticado previamente.

---

## 🟠 ALTOS

### A1. [SEC] Reset/cambio de contraseña self-service NO revoca refresh tokens
- **Archivo:** `server/src/controllers/authController.ts:233,358` · `memberSelfServiceController.ts:164`
- **Evidencia:** los tres actualizan `passwordHash` pero ninguno llama `revokeAllRefreshTokens(userId)` (el reset por admin SÍ lo hace, `adminAccessController.ts:320`). El refresh token solo se valida por existencia+expiración.
- **Impacto:** un atacante con refresh token robado mantiene acceso indefinido AUNQUE la víctima cambie su contraseña — toma de cuenta persistente.
- **Fix:** llamar `revokeAllRefreshTokens(userId)` + `invalidateUserAuthCache(userId)` tras cambiar contraseña (patrón ya existente en adminAccessController).

### A2. [BE] Doble booking posible — check y create sin transacción, lock ni constraint de exclusión
- **Archivo:** `server/src/controllers/v1AppointmentController.ts:280-327,701-737` · `agendaAvailabilityService.ts:61-201`
- **Evidencia:** `resolveAppointmentPlacement` solo lee; el create ocurre en llamada separada. Sin `EXCLUDE USING gist` ni unique por cabina/horario en migraciones.
- **Impacto:** dos requests concurrentes al mismo slot pasan ambas la validación → dos citas solapadas en la misma cabina con pacientes reales.
- **Fix:** constraint de exclusión Postgres (`EXCLUDE USING gist (cabinId WITH =, tstzrange(startAt,endAt) WITH &&) WHERE status IN (...)`) + manejo del error 23P01, o advisory lock transaccional por cabina+día.

### A3. [BE] Outbox: batch entero en `$transaction` con timeout default 5s → rollback con side effects ya ejecutados
- **Archivo:** `server/src/workers/outboxDispatcher.ts:82-101` · `server/src/db/prisma.ts:11-14`
- **Evidencia:** batch de 50 eventos dentro de una tx interactiva sin opciones (default 5s), pero los handlers escriben con `prisma` global y los emails ya salieron.
- **Impacto:** batch >5s cierra la tx → los updates a done/failed se revierten → al reintentar se re-ejecutan handlers completados: notificaciones y correos duplicados + ciclo fallo/pausa.
- **Fix:** reclamar IDs en tx corta (SKIP LOCKED) y procesar/marcar cada evento FUERA de la transacción con updates individuales.

### A4. [BE] Refresh token de Google revocado (`invalid_grant`) → divergencia silenciosa de agenda
- **Archivo:** `server/src/services/googleCalendarClient.ts:88-97` · `integrationJobService.ts:106-140`
- **Evidencia:** todos los errores se tratan igual: backoff → `failed` a los 8 intentos con solo `logger.error`. Nada desactiva la integración ni alerta.
- **Impacto:** si la clínica revoca el acceso Google, cada cambio de cita encola un job que fallará 8 veces; la agenda de Google diverge silenciosamente de Velum.
- **Fix:** detectar `invalid_grant` → `isActive=false`, cancelar jobs pendientes y `notifyAdmins("reconectar Google Calendar")`.

### A5. [DB] `Membership.amount Float?` — dinero en Float (tercera convención distinta)
- **Archivo:** `server/prisma/schema.prisma:302`
- **Impacto:** errores de redondeo IEEE-754; imposible conciliar contra Payment/CustomCharge sin conocer la unidad de cada tabla.
- **Fix:** migrar a `Int` centavos (o `Decimal @db.Decimal(12,2)`) con migración de datos.

### A6. [DB] Enum inexistente `"pending"` escrito a `Membership.status` — envenena webhooks de suscripción
- **Archivo:** `server/src/services/stripeWebhookService.ts:307` · `schema.prisma:17-23`
- **Evidencia:** mapea `incomplete` → `"pending"`, valor que no existe en `enum MembershipStatus`.
- **Impacto:** un `subscription.created/updated` con status `incomplete` (típico con 3DS) → PrismaClientValidationError → 500 → Stripe reintenta el mismo evento hasta 72h fallando siempre.
- **Fix:** mapear a `inactive` o añadir `pending` al enum vía `ALTER TYPE ... ADD VALUE`.

### A7. [DB] `onDelete: Cascade` de User hacia expediente médico, pagos, documentos y sesiones
- **Archivo:** `schema.prisma:448 (MedicalIntake), 697 (Payment), 338 (Document), 666 (SessionTreatment), 313 (Membership)`
- **Impacto:** un `DELETE FROM "User"` accidental (SQL directo, Prisma Studio) arrastra en silencio datos con retención legal. El flujo real es soft-delete; el Cascade no aporta nada y es una trampa.
- **Fix:** cambiar a `onDelete: Restrict` en esas cinco relaciones.

### A8. [DB] 5 migraciones editadas después de aplicadas en producción
- **Archivo:** `server/prisma/migrations/{20260216_v1_core_foundation, 20260427002000_rls, 20260427003000_outbox, 20260427004000_app_user_role, 20260427004500_force_rls}`
- **Evidencia:** commits 2b94f46 y 3ccdf65 (jun) modificaron migraciones de feb/abr. Viola la regla #5 del CLAUDE.md. (Nota: el fix Neon en sí quedó correcto — ELSE no-op idempotente.)
- **Impacto:** `migrate dev` contra la BD original reporta drift; la BD vieja ejecutó SQL distinto al del repo (auditabilidad rota).
- **Fix:** congelar la práctica; portabilidad futura vía migraciones nuevas idempotentes.

### A9. [FE] Retry automático de POSTs no idempotentes ante error de red
- **Archivo:** `services/apiClient.ts:79-82,115`
- **Evidencia:** `retries: 2` para TODAS las requests sin distinción de método; el server no usa `x-request-id` como clave de idempotencia.
- **Impacto:** si la conexión se corta después de que el server procesó un POST (crear cobro, checkout, cancelar cita), el cliente lo reenvía → mutaciones/cobros duplicados.
- **Fix:** reintentar por red solo GET/HEAD, o dedupe server-side por `x-request-id`.

### A10. [ARCH/QA] Frontend sin red de seguridad: tests espejo, sin strict mode, contrato tipado sin adoptar
- **Archivos:** `tests/CustomChargePage.test.ts:9` (redefine las funciones que dice testear) · `tsconfig.json` (sin `"strict"`) · `services/typedApi.ts` (0 consumidores; 19 `apiFetch<any>` en 11 archivos)
- **Evidencia:** 3 archivos de test FE (50 casos) vs 71 .tsx; 2 de 3 testean copias de la lógica, no el código; 69 `any` en FE vs 1 en server; el codegen está en CI pero nadie importa los types generados.
- **Impacto:** Agenda.tsx (1,837 líneas), Memberships.tsx y Admin.tsx (2,132) — los flujos donde el paciente paga y agenda — tienen 0% de cobertura real; los tests siguen en verde aunque cambies la lógica.
- **Fix:** activar `strict` incremental; exportar las funciones puras de los componentes e importarlas en los tests; migrar los 19 `apiFetch<any>` a `typedApi` o eliminar el pipeline de codegen.

### A11. [ARCH] Dos generaciones de API conviviendo sin plan de convergencia
- **Archivo:** `server/src/index.ts:250-275`
- **Evidencia:** rutas legacy (`/auth`, `/users/me`, `/admin/*`) junto a `/api/v1/*`; duplicado vivo: `PUT /users/me/profile` Y `PUT /api/v1/users/me/profile` con dos controllers distintos; 32 call sites legacy en el frontend.
- **Impacto:** cada cambio de contrato en dos superficies; el perfil puede divergir en validación entre generaciones.
- **Fix:** mapa legacy→v1, migrar los 32 call sites, middleware de deprecación antes de eliminar.

### A12. [OPS] Node 512 MB sin `--max-old-space-size` y arrancando con `tsx src/` en producción
- **Archivo:** `docker-compose.yml:15-19` · `server/scripts/start.sh:11` · `server/Dockerfile:14-25`
- **Evidencia:** la imagen compila `dist/` pero arranca `tsx src/index.ts` con node_modules completos (+~80 MB devDeps); sin `NODE_OPTIONS`.
- **Impacto:** V8 no dimensiona el heap por el cgroup → riesgo de OOM-kill "misterioso" bajo carga.
- **Fix:** `CMD node dist/index.js` + `npm ci --omit=dev` en el stage final + `NODE_OPTIONS=--max-old-space-size=384`.

---

## 🟡 MEDIOS

- **[SEC] TOTP en texto plano en DB** — `adminAccessController.ts:45`. Un dump de DB anula el 2FA de admins. Fix: cifrar con `aesGcmEncrypt` (patrón ya existente en phiCrypto).
- **[SEC] Rate-limit del reenvío de OTP es configuración muerta** — `rateLimits.ts:60-61` apunta a `/resend-otp` pero la ruta real es `/resend` (`customChargeRoutes.ts:42`, además sin auth). Permite email-bombing de 15 OTPs/10min al paciente. Fix: corregir el path y bajar el límite.
- **[SEC] PII en endpoint público** — `customChargeController.ts:215-242` (`getChargePublic`) devuelve email y nombre del paciente sin autenticación. Fix: enmascarar o exigir OTP antes de revelar.
- **[SEC] RLS declarado pero inactivo** — `withTenantContext.ts:23-28`: la app conecta como superuser (bypassa RLS), `RLS_ENFORCE=false` default, y muchos controllers consultan sin scope de tenant. Riesgo latente crítico al incorporar un segundo tenant.
- **[BE] Sync Google→Velum aplica cambios sin validar conflictos y puede revivir citas canceladas** — `googleCalendarSyncService.ts:77-88`. Arrastrar un evento en Google puede solapar citas en la misma cabina.
- **[BE] Depósito de cita: falso 409 + doble checkout** — `appointmentDepositController.ts:60-70,98-101`: el anti-duplicado consulta CUALQUIER payment del usuario, y la idempotency key cambia cada minuto → varias Checkout Sessions pagables.
- **[BE] Locks de crons no atómicos (find-then-upsert)** — `paymentReminderService.ts:28-47` · `appointmentReminderService.ts:14-35`: recordatorios duplicados al escalar. `cronLock.ts` (la alternativa correcta) tiene 0 call sites y además está roto (lock/unlock en conexiones distintas del pool).
- **[BE] SSE: fuga de memoria** — `sseService.ts:34-38`: el timer de 4h retiene cada Response cerrada (no hay `clearTimeout` en `close`). Presión real en un contenedor de 512 MB.
- **[BE] Notificaciones en vivo no llegan desde el worker** — `sseService.ts:5-6`: SSE es un Map en memoria por proceso; los eventos generados en worker.ts (pagos, renovaciones) no suenan la campana. Fix: Postgres LISTEN/NOTIFY.
- **[BE] Webhook Google sin token degrada a "sin autenticación"** — `googleCalendarWebhookController.ts:25-29`: la verificación es opcional según env. Fix: warn al boot / exigir en prod.
- **[DB] Webhook Stripe multi-tabla sin `$transaction` y catches que devuelven 200** — `stripeWebhookService.ts:465-480,522-547`: estados intermedios permanentes (depósito pagado sin cita creada) sin retry de Stripe.
- **[DB] `upsertMembership` no atómico y sin protección out-of-order** — `stripeWebhookService.ts:311-399`: webhooks fuera de orden pueden dejar el status viejo como último write.
- **[DB] AuditLog no es append-only a nivel de base** — el GRANT incluye UPDATE/DELETE. Fix: `REVOKE UPDATE, DELETE ON "AuditLog" FROM app_user` + trigger.
- **[DB] `AuditLog.resourceId` sin índice pese a filtro real** — `auditAdminController.ts:18` · `schema.prisma:363-372`. Seq scan en la tabla de mayor crecimiento.
- **[DB] Catch literalmente vacío al cancelar suscripción Stripe en borrado de usuario** — `adminAccessController.ts:566-574`: paciente "eliminado" al que se le sigue cobrando, sin traza.
- **[DB] Timestamps sin `timestamptz` en tablas financieras/auditoría** — Payment, Membership, AuditLog siguen `TIMESTAMP(3)`. Riesgo real al mover a Neon (región distinta): corrimientos en cortes de caja.
- **[FE] `/admin` y `/dashboard` sin `RequireRole` en el router** — `App.tsx:56-57`: la protección depende de guards internos de cada página (hoy sin fuga, pero defensa inconsistente).
- **[FE] `?checkout=success` confiado a ciegas sin refetch** — `Dashboard.tsx:365-384`: carrera con el webhook → toast "activada" con membresía aún inactiva.
- **[FE] Errores de API silenciados como estados vacíos** — `Dashboard.tsx:324-337`: con API caída, la paciente ve "no tienes citas" en lugar de un error. En un sistema clínico esto induce decisiones erróneas.
- **[FE] Export CSV falla en silencio absoluto** — `ExportButton.tsx:29-31` + `Admin.tsx:1698-1702`: `onError` opcional y nadie lo pasa.
- **[FE] Contextos sin memoizar** — `ToastContext.tsx:49` · `AuthContext.tsx:174-190`: cada toast re-renderiza Admin.tsx completo.
- **[FE] Botón de pago se re-habilita durante el redirect a Stripe** — `Memberships.tsx:151-158`: ventana de doble checkout (Agenda.tsx lo hace bien).
- **[QA] "161 tests" es falso** — el número real es ~797 (747 backend + 50 frontend); `npm test` en root corre solo el 6%. Fix: actualizar CLAUDE.md + script `test:all`.
- **[QA] Los tests de aislamiento RLS nunca corren en CI** — `rlsIsolation.test.ts:50` (`skipIf(!RLS_DB_URL)`) y ci.yml no define esa variable: 568 líneas de tests de tenant saltadas en cada push.
- **[QA] Umbral de cobertura comentado desde "Fase 0"** — `server/vitest.config.ts:22-24`: tres meses después sigue apagado.
- **[ARCH] 100 accesos directos a Prisma en 20 de 31 controllers** — capa service bypasseada (memberSelfService: 17, adminAccess: 12, v1Payment: 9). Fix: regla de lint + migración gradual empezando por dinero y PHI.
- **[ARCH] REFACTOR_PLAN.md desactualizado en sentido inverso** — Fases 6-8 marcadas 🔲 pero YA implementadas (tests, GDPR endpoints, ADRs). Riesgo de re-implementar trabajo terminado.
- **[ARCH] God-pages en frontend** — Admin.tsx 2,132 · Agenda.tsx 1,837 · Dashboard.tsx 1,757 líneas. El refactor de god-files solo atacó el backend.
- **[OPS] Tres infraestructuras declaradas sin fuente de verdad** — CLAUDE.md describe el VPS Docker, Vercel sirve el dominio, render.yaml+Neon+R2 son el destino a medias. Fix: terminar el cutover y actualizar CLAUDE.md.
- **[OPS] Imagen de producción con devDependencies y sin rotación de logs Docker** — `server/Dockerfile` · `docker-compose.yml` (sin `logging:`): disco lleno mata Postgres y API en el VPS.
- **[OPS] Deploy sin rollback ni versionado de imágenes** — `deploy.sh` solo reconstruye nginx; sin tags por commit.

## 🔵 BAJOS (selección)

- [SEC] `deleteMyAccount` limpia cookies con nombres/paths equivocados (`memberSelfServiceController.ts:369-370`).
- [SEC] Caché de auth (30s) no se invalida al cambiar contraseña/desactivar usuario (`middlewares/auth.ts:15-46`).
- [SEC] Detección de reuse de refresh token no revoca la familia (`authTokenService.ts:49-75`).
- [SEC] Timing side-channel de enumeración de usuarios en login (`authController.ts:133-142`).
- [SEC] Leads/marketing públicos sin rate-limit dedicado (`v1LeadRoutes.ts:7-9`).
- [BE] HTML injection en emails de notificación: `name` sin escapar (`notificationEmailService.ts:85`).
- [BE] `resetProcessingIntegrationJobs` resetea jobs de otros procesos sin filtrar `lockedAt` stale (`integrationJobService.ts:142-152`).
- [FE] `fetch()` directos que se saltan apiClient (`usePaymentHistory.ts:68`, `ExportButton.tsx:21`).
- [FE] `hooks/useAdminData.ts` es código muerto homónimo del hook real (riesgo de import equivocado).
- [FE] `velum_pending_plan` en localStorage persiste entre usuarios del mismo navegador (`Memberships.tsx:69,126`).
- [FE] `Retry-After` en formato fecha → `sleep(NaN)` → martilleo bajo 429 (`apiClient.ts:64-67`).
- [DB] Estados como String libre donde el dominio es cerrado (`syncStatus`, `feedbackSeverity`).
- [DB] Dos migraciones comparten timestamp `20260427004000_`; `User.email @unique` global no preparado para multi-tenant.
- [OPS] Umami (`/stats/script.js`) → 404 en cada pageview del deploy Vercel.
- [OPS] nginx sin rate limiting de borde (el incidente Hetzner de $1,000 fue exactamente este modo de falla; Cloudflare planeado en MIGRATION.md, no ejecutado).
- [OPS] `worker` en compose declara `build:` + `image:` reutilizando el tag del API.
- [QA] Husky pre-commit solo existe en server/.
- [ARCH] Ciclo de imports notificationService ⇄ notificationEventHandlers; naming mixto español/inglés en componentes.

---

## ✅ Lo que está BIEN (y hay bastante)

- **Auth de libro:** JWT HS256 con algoritmo fijado, cookie httpOnly+secure, nunca localStorage (verificado también en FE); bcrypt cost 12, lockout, historial anti-reuso, OTP con CSPRNG, `timingSafeEqual` en tokens de confirmación.
- **Webhook Stripe impecable en su recepción:** `express.raw()` antes de `express.json()`, firma verificada, idempotencia atómica create-or-catch con fail-safe 500.
- **Sin secretos hardcodeados:** el boot falla si faltan o quedan en placeholder (`env.ts`); `.env` nunca en la historia de git; compose sin secretos, postgres solo en 127.0.0.1.
- **Hardening completo:** helmet+CSP estricta, HSTS, CORS allowlist, anti path-traversal en storage, magic bytes en uploads, redacción de PII en pino, `/docs` bloqueado en nginx (regla cumplida), errorHandler sin stack traces.
- **Capa de datos disciplinada:** Prisma singleton con pool tuning, paginación con maxLimit en todos los listados, export CSV por cursor, soft-delete con OTP, outbox con SKIP LOCKED + dead-letter + Sentry, RLS y outbox diseñados con criterio.
- **Suite backend de calidad real:** ~747 casos, webhooks Stripe con 8 archivos de test (dedup, refunds, grace period, reconciliation), fake timers, cero `.skip`/`@ts-ignore` en 55K líneas; CI moderno (typecheck ambos lados, codegen gate, size-limit, Postgres real).
- **Frontend con fundamentos sanos:** auth derivada 100% del server, cero `dangerouslySetInnerHTML`, apiClient centralizado con refresh compartido anti-avalancha, montos siempre calculados en server, CustomChargePage ejemplar, timers con cleanup, error boundaries por sección.
- **Anti-loop de Google Calendar bien diseñado** (velumOrigin + lastPushedAt + ventana 10s; sin loop estructural) y graceful shutdown en API y worker.
- **El fix Neon de migraciones (3ccdf65) quedó técnicamente correcto** (ELSE no-op idempotente, GRANTs vía current_user).

---

## Plan de remediación recomendado

**Hoy (incidente + exposición):**
1. C1 — restablecer conectividad frontend↔API en velumlaser.com (decidir Render vs VPS, DNS/rewrite, checklist MIGRATION.md paso 9).
2. C3 — rotar las cuentas seed en la DB de producción.
3. C4 — un backup manual verificado de la DB viva, hoy; luego arreglar el mecanismo.

**Esta semana (dinero + silencios):**
4. C2 — unificar unidades de dinero en Payment (+ migración de datos) y re-lanzar en `upsertPaymentRecord`.
5. C5 — fix de ~10 líneas en `sendWithResilience` (emails dejan de fallar en silencio).
6. C6 + A9 — apiClient: no redirigir a login a anónimos; no reintentar POSTs.
7. A6 — mapear `incomplete` correctamente (webhooks de suscripción dejan de envenenarse).
8. A1 — revocar refresh tokens al cambiar contraseña.

**Este mes (robustez):**
9. A2 — constraint de exclusión para doble booking.
10. A3 — sacar el procesamiento del outbox de la transacción.
11. A4 — manejar `invalid_grant` de Google con desactivación + alerta.
12. A5/A7/A8 — Float de dinero, Cascade peligrosos, congelar edición de migraciones.
13. A12 + logs Docker + backups offsite.

**Trimestre (deuda estructural):**
14. A10 — strict mode FE + tests reales de Agenda/Memberships/CustomCharge.
15. A11 — convergencia legacy→v1.
16. RLS activo con rol no-superuser antes de cualquier segundo tenant; RLS_DB_URL en CI.
17. Split de god-pages (Agenda primero) + adopción de typedApi.
