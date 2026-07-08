# Remediación de auditoría — VELUM OS

**Fecha:** 2026-07-07
**Base:** informe en `docs/AUDITORIA-2026-07-07.md`
**Alcance ejecutado:** bugs + seguridad + robustez + hardening + tests. Refactors estructurales grandes (split de god-pages, convergencia legacy→v1, adopción typedApi, strict-mode FE) **diferidos** por decisión de alcance.
**Estado de verificación:** backend `741 tests` verdes + `tsc` 0 errores · frontend `50 tests` verdes + `tsc` 0 errores (los 3 errores de `stories/*` son preexistentes de `@storybook/react-vite`).

---

## ✅ Qué se corrigió (por fase)

### Fase 1 — Críticos backend
- **C5 Resend (emails en silencio):** `emailService.ts` y `notificationEmailService.ts` ahora convierten el `{data,error}` de Resend en `throw` → se reactivan retry + circuit breaker (antes código muerto). Breaker **por propósito** (una caída de recordatorios ya no bloquea OTP/reset/verificación). Short-circuit + **aviso al boot** si falta una `RESEND_KEY`. Escape de HTML en `name` de notificaciones.
- **A6 enum:** `stripeWebhookService.ts` mapea `incomplete`/`incomplete_expired` → `inactive` (antes `"pending"`, valor inexistente en el enum → 500 → Stripe reintentaba 72h).
- **C2 dinero:** `Payment.amount` se almacena/lee en **pesos enteros** consistentemente. Escritura redondeada (`toStoredPesos`, nunca revienta el `Int` con fracciones), y los 2 exports CSV (`v1PaymentController`, `exportController`) dejan de dividir entre 100. Cero migración de datos de pagos (ya estaban en pesos).

### Fase 2 — apiClient
- **C6:** ya no se expulsa a login a visitantes **anónimos** (redirect solo si había sesión autenticada — flag sincronizado desde `AuthContext`).
- **A9:** los reintentos por error de red aplican **solo a métodos idempotentes** (GET/HEAD) — POST/PATCH/PUT/DELETE ya no se reintentan (evita cobros/reservas duplicados).
- `Retry-After` en formato fecha ya no produce `sleep(NaN)`.

### Fase 3 — Seguridad
- **A1:** reset / cambio-inicial / cambio self-service de contraseña ahora **revocan todos los refresh tokens** + invalidan la caché de auth (un token robado no sobrevive al cambio).
- **TOTP cifrado at-rest** (AES-256-GCM) con compat de secretos legacy en claro (sin migración, sin romper 2FA existente).
- **Rate-limit del reenvío de OTP** corregido (ruta real `/resend`, antes apuntaba a `/resend-otp` inexistente) y **clavado por ID de cobro** (evita bombardear el email de un paciente cambiando de IP). Limiter dedicado para leads/marketing públicos.
- **PII:** el endpoint público de cobro enmascara el email del paciente.
- **Timing:** el login ejecuta un bcrypt dummy para emails inexistentes (anti-enumeración).
- Cookies de `deleteMyAccount` con nombres/path reales.

### Fase 4 — DB (schema + migración `20260707000000_audit_money_fk_hardening`)
- `Membership.amount` **Float → Int** (pesos enteros).
- `onDelete: Cascade → Restrict` en User → MedicalIntake/Payment/Document/SessionTreatment/Membership (un DELETE accidental ya no arrastra datos con retención legal).
- Índice `AuditLog.resourceId`.
- `AuditLog` **append-only** a nivel base (`REVOKE UPDATE, DELETE ... FROM app_user`).
- `seed.ts`: admin exige `ADMIN_PASSWORD` por env (sin default), `mustChangePassword: true`, y las cuentas demo **no se crean en producción**.

### Fase 5 — Robustez backend
- **SSE:** `clearTimeout` del timer de 4h al cerrar la conexión (fuga de memoria en 512 MB).
- **Outbox:** `$transaction` con timeout amplio para que el batch no haga rollback a mitad (evita re-ejecutar handlers ya ejecutados → emails duplicados).
- **Depósito:** idempotency key estable por `userId+slot` (antes cambiaba cada minuto → múltiples checkouts pagables) + anti-duplicado corregido al flag real `appointmentDepositAvailable` (antes consultaba `Payment`, que los depósitos no crean → falso 409 con pagos de membresía).
- **A4 Google `invalid_grant`:** desactiva la integración + alerta a Sentry (antes reintentaba 8× por job en silencio y la agenda divergía).
- Fallo de escritura de pago en el webhook ahora **alerta a Sentry** (antes silencioso).

### Fase 6 — Robustez frontend
- `/dashboard` protegido con `RequireRole` (NO se envolvió `/admin`: rompería su propio formulario de login admin).
- Retorno de Stripe `?checkout=success` ahora **repoll de `/membership/status`** (cierra la carrera con el webhook).
- Errores de carga en Dashboard **avisan con toast** en vez de mostrar "no tienes datos".
- `ExportButton` **siempre** notifica el fallo (toast fallback) + nuevo helper `services/downloadBlob.ts` (timeout).
- `ToastContext` **separado en acciones (estables) vs estado** — un toast ya no re-renderiza todas las páginas.
- Botón de pago en Memberships no se re-habilita durante el redirect a Stripe (ventana de doble checkout).
- `localStorage velum_pending_plan` se limpia en checkout y logout (no se hereda entre usuarias del navegador).
- Eliminado hook muerto `hooks/useAdminData.ts`.

### Fase 7 — OPS/QA
- `render.yaml`: `NODE_OPTIONS=--max-old-space-size=384` (anti-OOM en 512 MB).
- `deploy/backup-postgres.sh`: `DB_USER` corregido (antes `velumapp`, inexistente → `pg_dump` fallaba).
- `CLAUDE.md`: conteo real de tests + `npm run test:all`.
- `server/vitest.config.ts`: env de tests inyectada → `npm test` corre localmente sin exportar vars a mano (antes ~19 archivos fallaban al colectar).

---

## ⏸️ Diferido (con razón)

| Item | Severidad | Por qué se difirió |
|---|---|---|
| Revocación de **familia** de refresh tokens ante reuse | BAJO | Requiere `familyId` en el schema; el caso "not found" no tiene userId recuperable. El token robado-y-rotado ya queda inservible hoy. |
| Webhook Stripe **idempotencia at-least-once** (delete-on-failure) | MEDIO | El fix de Fase 1 ya eliminó la causa común de pérdida (fracción→Int). El restructure completo arriesga duplicar side effects; se dejó alerta a Sentry. |
| **timestamptz** en tablas financieras/auditoría | MEDIO | Migración amplia; las críticas (Appointment) ya se hicieron antes. Neon en misma región mitiga. |
| Google **sync conflict validation** / webhook token warn | MEDIO | El gate real (match exacto channel/resource) ya protege; validación de conflicto es cambio mayor. |
| **cron locks** atómicos (`updateMany` condicional) | MEDIO | Solo importa con >1 instancia; hoy single-instance. |
| **RLS_DB_URL** en CI | MEDIO | Necesita rol no-superuser que refleje una config de prod hoy inactiva (`RLS_ENFORCE=false`). |
| Refactors estructurales (god-pages, legacy→v1, typedApi, strict-mode FE) | — | Fuera del alcance acordado (bugs+seguridad primero). |

---

## 🔧 ACCIONES DE ENTREGA — lo que TÚ debes ejecutar

Estos pasos requieren acceso a dashboards / DB de producción que yo no tengo.

### 1. C1 — Conectar el frontend con la API (INCIDENTE ACTIVO)
El frontend en Vercel llama a `/api` (mismo origen) y da 404. El API Express necesita un host **always-on** (worker/cron/SSE no corren en serverless de Vercel).
- **Decide dónde vive el API.** Recomendado: **Render** (ya configurado en `render.yaml` para Neon+R2). Alternativa: el VPS.
- En Vercel, define `VITE_API_URL=https://api.velumlaser.com` (o la URL del host) y **rebuild** del frontend.
- Crea el DNS `api.velumlaser.com` → el host del API.
- En Render (o el host), rellena las env `sync: false` del `render.yaml` (incluye **regenerar `STRIPE_WEBHOOK_SECRET`** — nuevo endpoint = nuevo `whsec_`).
- Repunta los webhooks de Stripe y Google al nuevo dominio.
- Verifica: login, upload R2, webhook Stripe devuelve 200.

### 2. C3 — Rotar las cuentas seed en producción (HOY)
Las cuentas `admin/staff/system/member@velum.mx` probablemente viven con la contraseña pública `ChangeMe123456!`. **Cámbialas ya** en la DB de producción. (El `seed.ts` corregido evita que vuelva a pasar en DBs nuevas.)

### 3. Aplicar la migración (con backup previo)
```bash
# 1) Backup de la DB viva ANTES de nada
# 2) Revisar server/prisma/migrations/20260707000000_audit_money_fk_hardening/migration.sql
#    (opcional: probar en una copia con `prisma migrate deploy`)
cd server && npx prisma migrate deploy
```
La migración es defensiva (idempotente, portable a Neon) pero cambia tipos y FKs sobre datos reales — revísala contra un snapshot primero.

### 4. C4 — Backups de la DB (Neon)
Neon: activa PITR (planes pagos) o programa un `pg_dump` externo con copia offsite (R2 vía rclone). El script del VPS (`deploy/backup-postgres.sh`) solo aplica si el API vuelve al VPS.

### 5. Deploy
- Frontend (Vercel): auto en push a `main`.
- API (Render): `prisma generate` + `prisma migrate deploy` corren en el arranque (`server/scripts/start.sh`).
- Recomendado a futuro (no bloqueante): cambiar `start.sh` de `tsx src/` a `node dist/` + `npm ci --omit=dev` en la imagen (menos RAM/arranque).
