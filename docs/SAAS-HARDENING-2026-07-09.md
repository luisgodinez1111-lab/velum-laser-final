# SaaS Hardening — VELUM OS

**Fecha:** 2026-07-09
**Contexto:** tras la auditoría de validación (código nivel Producción, infra nivel MVP), este documento cubre (1) lo aplicado en código/config, (2) las acciones de dashboard que solo tú puedes ejecutar, y (3) el plan por etapas para la deuda estructural. No se cramean refactors grandes ni cambios de infra en un sistema médico vivo.

---

## ✅ 1. Aplicado en este pase (código/config, verificado)

| Cambio | Archivo | Efecto |
|---|---|---|
| `/docs` (Swagger) bloqueado en producción | `server/src/index.ts` | Deja de exponer la superficie de la API públicamente (regla #9, que en el VPS hacía nginx). |
| Resend de OTP de cobro reporta fallo real | `server/src/controllers/customChargeController.ts` | Ya no devuelve `200` falso si el email falla → `502` para que el cliente reintente. |
| Backup automático de Neon → R2 | `.github/workflows/neon-backup.yml` | `pg_dump` diario a TU R2 (no a GitHub). **El P0 de DR.** |
| Observabilidad cableada | `render.yaml` | `SENTRY_DSN`/`OTEL_*` declaradas (el código ya se auto-activa si existen). |
| Boot ~8s más rápido | `server/scripts/start.sh` | Quita el `prisma generate` redundante (ya viene en la imagen). |
| `trust proxy` | `server/src/index.ts:196` | *(ya estaba)* — el rate-limit cuenta por IP real tras Render. |

> `x-powered-by: Express` solo aparece en `/health` (registrado antes de helmet); las rutas reales sí traen CSP/HSTS/nosniff completos (verificado en vivo).

---

## 🔧 2. Acciones de dashboard — SOLO TÚ (por prioridad)

### 🔴 P0 — esta semana (no perder datos / no caer por un ataque)

**A. Activar el backup de Neon** (el workflow ya está en el repo)
GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**, agrega:
```
NEON_DATABASE_URL     = tu conexión DIRECTA de Neon (sin -pooler), rol owner
R2_BUCKET             = nombre del bucket
R2_ENDPOINT           = https://<accountid>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID      = <token R2>
R2_SECRET_ACCESS_KEY  = <token R2>
```
Luego: Actions → "Neon DB Backup → R2" → **Run workflow** (prueba manual) → verifica que aparezca el `.dump` en R2. Después corre solo cada día 08:00 UTC.
- En Cloudflare R2, añade una **Lifecycle Rule** en `db-backups/` (borrar > 90 días) para no acumular.
- **Prueba un restore** al menos una vez: `pg_restore --clean --no-owner -d "<url_directa>" velum-neon-XXXX.dump` sobre una branch de Neon.

**B. Cloudflare al frente** (el borde que faltó en el incidente de $1000)
- Agrega `velumlaser.com` a Cloudflare (cambia los nameservers en Neubox a los de Cloudflare).
- Proxy naranja en `api.velumlaser.com` y `velumlaser.com`.
- Activa **WAF managed rules** + un **rate-limit rule** en `/auth/*` y `/api/*`.
- Bonus: BotID / Bot Fight Mode.

### 🟡 P1 — este mes (confiabilidad + visibilidad)

**C. Matar el sleep de Render free** (webhooks/OTP llegan tarde en cold-start)
- **Recomendado:** Render → **Starter plan** (~$7/mes) → sin sleep, más RAM, y desbloquea `preDeployCommand` para migraciones.
- **Alternativa gratis:** [cron-job.org](https://cron-job.org) → tarea cada 10 min a `https://api.velumlaser.com/health`. (No usé GitHub Actions para esto: consume minutos y sus schedules son best-effort.)

**D. Encender observabilidad** (hoy prod corre a ciegas)
- Crea proyecto en [Sentry](https://sentry.io) → copia el DSN → ponlo en Render como `SENTRY_DSN`. El código ya lo inicializa solo.
- Opcional: OTel a Grafana Cloud → `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`.
- Monitor de uptime (UptimeRobot/BetterStack) a `/health` con alerta.

**E. Endpoint pooled de Neon para runtime** (antes de escalar)
- Cuando pases a >1 instancia: `DATABASE_URL` → endpoint **pooled** de Neon, y `DIRECT_URL` (con `directUrl` en schema.prisma) para migraciones. Por ahora la conexión directa está bien para 1 instancia.

**F. Rotar los secretos expuestos**
- Revoca en Resend las 2 API keys que pasaron por el chat; crea una fresca (Full access) → ponla en las 6 `RESEND_KEY_*`.
- Considera un secret manager (Doppler/1Password/Vault) en vez de env plano (tienes Stripe LIVE + PHI key ahí).

---

## 🏗️ 3. Deuda estructural — plan por ETAPAS (no en un push)

Estos son refactors grandes sobre un sistema vivo. Se hacen **uno por uno, con tests, en su propia rama/PR** — no todos de golpe.

**Etapa 0 — Habilitar los gates de CI** *(prerequisito de calidad)*
El `ci.yml` nombra "lint" pero **no lo corre**: hay **276 errores de eslint preexistentes** (agregarlo ahora rompería el pipeline). Limpiarlos (muchos son auto-fixables con `eslint --fix`), y ENTONCES: (a) agregar `npm run lint` al job backend, (b) fijar umbrales de cobertura en `server/vitest.config.ts` (medir primero, poner el umbral ligeramente por debajo), (c) cablear `smoke-postdeploy.sh` tras el deploy, (d) exigir CI verde antes del auto-deploy de Render.

**Etapa 1 — Strict mode en el frontend** *(mecánico, medio-riesgo)*
Activar `"strict": true` en `tsconfig.json` (root) e ir tipando los ~69 `any`. Empezar por `noImplicitAny`, luego `strictNullChecks`. Bloquea errores de null en páginas de pago/agenda.

**Etapa 2 — Partir los god-pages** *(alto valor, alto cuidado)*
`Admin.tsx` (2132), `Agenda.tsx` (1837), `Dashboard.tsx` (1775). Extraer lógica pura a hooks/utils testeables (Agenda primero — es el flujo más complejo). Aplicar la misma estrategia que funcionó en el backend (agendaService → 8 módulos).

**Etapa 3 — Converger API legacy → v1** *(reduce superficie dual)*
Documentar el mapa legacy→v1, migrar los ~32 call-sites del frontend a v1, marcar rutas legacy con middleware de deprecación, y adoptar `typedApi` (hoy en 1 de 17 consumidores) para cerrar el contrato tipado.

**Etapa 4 — Activar RLS multi-tenant** *(antes de la 2ª clínica)*
Conectar la app como `app_user` (NOBYPASSRLS), `RLS_ENFORCE=true`, envolver los call-sites en `withTenantContext`, middleware tenant-resolver (subdominio/JWT), quitar el fallback permisivo `tenant_id IS NULL`, rotar el password de `app_user`. El andamiaje ya está construido.

**Etapa 5 — Imagen de prod compilada** *(eficiencia, requiere prueba)*
`start.sh` → `node dist/index.js` en vez de `tsx src/` + `npm ci --omit=dev`. **Requiere verificar que `dist` corre standalone con Node** (ESM necesita extensiones `.js` en imports — probar antes de pushear). Mover migraciones a `preDeployCommand` de Render (deja de correr en cada boot).

---

## Resumen
- **Código:** nivel Producción, remediación 100% aplicada y validada.
- **Infra:** subirla de MVP a SaaS-Scale es **config + planes pagos + activación**, no reescritura.
- **Orden:** backups (P0) → Cloudflare (P0) → Render Starter + Sentry (P1) → estructural por etapas.
