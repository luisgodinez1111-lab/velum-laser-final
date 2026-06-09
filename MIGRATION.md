# Migración VELUM OS — Hetzner → Deploy $0

> Sacar el backend de Hetzner y desplegarlo en infraestructura sin costo fijo.
>
> **Stack destino:** Render (API + worker inline, 1 servicio) · Neon (Postgres + pgvector) · Cloudflare R2 (uploads) · Vercel (frontend, sin cambios) · Cloudflare (proxy/rate-limit).
>
> **Dos verdades duras de este camino (asumidas):**
> 1. Render free **se duerme** → keep-alive obligatorio (paso 6).
> 2. Filesystem **efímero** → uploads en R2 obligatorio (paso 4). Sin esto se pierden documentos firmados.

---

## 0. Antes de empezar — la factura de Hetzner ($1000)

Esto **no espera a la migración**. Abre ticket en Hetzner (abuse/billing): una factura así suele ser overage de tráfico por el ataque, y **Hetzner frecuentemente lo condona o reduce** si demuestras que fue abuso y que ya lo remediaste. Identifica en el panel > Traffic cuál de los 4 proyectos lo causó. **VELUM tiene `express-rate-limit` aplicado** (`server/src/index.ts:238`) → probablemente no fue el culpable.

---

## Cambios de código (ya hechos en el repo)

Estos commits ya están listos; solo necesitas configurar la infra:

| Cambio | Archivo | Qué hace |
|---|---|---|
| Worker inline | `server/src/workers/startWorkerTasks.ts` (nuevo), `worker.ts`, `index.ts` | `RUN_WORKER_INLINE=true` arranca outbox+crons dentro del API (1 proceso) |
| Storage R2 | `server/src/services/storageService.ts`, `documentController.ts` | `STORAGE_DRIVER=r2` guarda/lee uploads en Cloudflare R2 |
| Env vars | `server/src/utils/env.ts`, `.env.example` | nuevas: `RUN_WORKER_INLINE`, `STORAGE_DRIVER`, `R2_*` |
| Deploy | `render.yaml` (nuevo) | Blueprint de Render |

Reversible: con `RUN_WORKER_INLINE=false` + `STORAGE_DRIVER=local` el sistema se comporta exactamente como en el VPS.

---

## 1. Backup fresco de la base (desde el VPS)

Aunque ya tengas backups, saca uno **inmediatamente antes** de migrar para no perder datos generados entre el último backup y el cutover:

```bash
# En el VPS:
docker compose exec -T postgres pg_dump -U postgres -Fc velum > velum_$(date +%F).dump
# Cópialo a tu máquina:
scp usuario@vps:~/velum_*.dump .
```

> `-Fc` = formato custom (comprimido, restaurable con pg_restore). El sistema usa `pgvector` — Neon lo soporta nativo.

---

## 2. Neon — Postgres + pgvector

1. Crea cuenta en **neon.tech** → New Project (región cercana, ej. AWS us-east).
2. En el SQL Editor de Neon, habilita la extensión:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copia el connection string (incluye `?sslmode=require`). Ese es tu `DATABASE_URL`.

---

## 3. Restaurar los datos en Neon

```bash
# La DB destino en Neon ya existe (suele llamarse 'neondb' o la que creaste).
pg_restore --no-owner --no-acl --clean --if-exists \
  -d "postgresql://USER:PASS@ep-xxx.neon.tech/DBNAME?sslmode=require" \
  velum_2026-06-09.dump
```

Verifica:
```bash
psql "postgresql://...neon.tech/DBNAME?sslmode=require" -c "\dt" | head
psql "postgresql://...neon.tech/DBNAME?sslmode=require" -c "SELECT count(*) FROM \"User\";"
```

> Si `pg_restore` se queja por la extensión `vector`, asegúrate de haber corrido el paso 2.2 **antes** del restore.

---

## 4. Cloudflare R2 — uploads (gratis, 10 GB)

1. Cloudflare Dashboard → **R2** → Create bucket, ej. `velum-documents`.
2. R2 → **Manage R2 API Tokens** → Create → permiso **Object Read & Write** sobre el bucket.
   Guarda: Access Key ID, Secret Access Key, y el endpoint `https://<accountid>.r2.cloudflarestorage.com`.
3. **Migrar los archivos existentes del VPS a R2** (los documentos ya subidos):
   ```bash
   # En tu máquina, con rclone (https://rclone.org):
   rclone config   # crea un remote tipo "s3" provider Cloudflare con las llaves R2
   # Copia los uploads del VPS (descárgalos antes con scp -r o rsync):
   scp -r usuario@vps:/var/velum/uploads ./uploads-backup
   rclone copy ./uploads-backup velumR2:velum-documents --progress
   ```
   > Las `storageKey` en la DB son rutas relativas (`<userId>/<uuid>.<ext>`). R2 las usa como key tal cual, así que los documentos existentes seguirán resolviendo sin tocar la base.

---

## 5. Render — desplegar el API

1. Sube el repo a GitHub (Render lee de ahí). `render.yaml` ya está en la raíz.
2. Render Dashboard → **New → Blueprint** → conecta el repo → detecta `render.yaml`.
3. Rellena las env vars marcadas `sync: false`:
   - `DATABASE_URL` → el de Neon (paso 2).
   - `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` → del paso 4.
   - `JWT_SECRET`, `INTEGRATIONS_ENC_KEY`, `PHI_MASTER_KEY`, `GOOGLE_WEBHOOK_TOKEN` → **los MISMOS valores del VPS** (si cambias PHI_MASTER_KEY no podrás descifrar PHI existente; si cambias INTEGRATIONS_ENC_KEY se rompen las integraciones guardadas).
   - Stripe, Resend, Google, WhatsApp, Anthropic → mismos valores del VPS.
4. Deploy. El `start.sh` corre `prisma migrate deploy` automáticamente contra Neon.
5. Verifica el arranque en los logs: debe decir `RUN_WORKER_INLINE=true — worker arrancando`.

---

## 6. Keep-alive (que no se duerma)

Render free duerme tras ~15 min sin tráfico. Configura **cron-job.org** (gratis):
- URL: `https://<tu-servicio>.onrender.com/health`
- Intervalo: cada **10 minutos**.

> Esto mantiene vivo el proceso para que los webhooks de Stripe/Google y el outbox dispatcher no acumulen retraso. Aun así, Stripe reintenta webhooks fallidos hasta 3 días, así que un cold-start ocasional no pierde cobros — solo los retrasa.

---

## 7. Cloudflare delante + `api.velumlaser.com`

Para que la **cookie httpOnly de auth funcione** (frontend `velumlaser.com` ↔ API), el API debe vivir bajo el mismo dominio raíz:

1. Cloudflare → DNS → registro **CNAME** `api` → `<tu-servicio>.onrender.com`, **proxy activado (nube naranja)**.
2. En Render → Settings → Custom Domain → añade `api.velumlaser.com`.
3. Cloudflare → Security → **Rate limiting rules**: añade una regla (ej. 100 req/min por IP en `/api/*`) — esto es la protección de borde que faltó en el incidente.
4. Confirma que `COOKIE_DOMAIN=.velumlaser.com` y `COOKIE_SAME_SITE=lax` (ya en `render.yaml`).

---

## 8. Cutover — repuntar todo al nuevo backend

1. **Vercel** (frontend): variable `VITE_API_URL` → `https://api.velumlaser.com`. Redeploy.
2. **Stripe** → Developers → Webhooks → nuevo endpoint `https://api.velumlaser.com/api/v1/stripe/webhook`. Copia el nuevo `whsec_...` a `STRIPE_WEBHOOK_SECRET` en Render. Borra el endpoint viejo del VPS.
3. **Google Calendar** → los canales push (watch) apuntan a la URL vieja. Hay que re-registrarlos con la nueva `BASE_URL`. Revisa cómo se renuevan en `googleCalendarWebhookRoutes` / el integration worker; normalmente expiran y se re-crean solos al re-conectar la integración, o fuérzalo desde `/settings/AgendaIntegrations`.
4. **Resend / WhatsApp** → no cambian (son salientes), pero verifica que el dominio de envío siga verificado.

---

## 9. Validación en caliente (antes de apagar el VPS)

- [ ] `GET https://api.velumlaser.com/health` → `{ ok: true }`
- [ ] Login de un paciente (verifica que la cookie se setea en `.velumlaser.com`)
- [ ] Ver una cita en Agenda
- [ ] Subir un documento → confirmar que aparece en el bucket R2
- [ ] Descargar ese documento (valida el driver R2 de lectura)
- [ ] Un cobro de prueba en Stripe → confirmar que el webhook llega (Stripe Dashboard → evento → 200)
- [ ] Logs de Render sin errores de `prisma`/`R2`/`worker`

---

## 10. Apagar Hetzner

Solo cuando el paso 9 esté 100% verde:

```bash
# En el VPS:
docker compose down            # apaga API, worker, postgres, nginx, umami
```

Conserva un backup final del volumen `postgres_data` y de `/var/velum/uploads` antes de borrar el servidor. Luego cancela/borra el proyecto VELUM en Hetzner para detener el cobro.

---

## Notas / riesgos conocidos

- **RAM (512 MB en Render free):** API+worker juntos pueden quedar justos. Si ves OOM/reinicios en logs, sube a Render Starter (~$7) o mueve el worker a su propio servicio (`RUN_WORKER_INLINE=false` + segundo servicio con `command: tsx src/worker.ts`).
- **Umami (analytics):** no se migra en este plan (no es crítico). Si lo quieres, corre Umami Cloud free o un servicio aparte apuntando a una DB Neon separada.
- **Neon autosuspende** en inactividad → primer query tras idle ~500 ms. Irrelevante con el keep-alive del paso 6.
- **Secretos que NO debes cambiar:** `PHI_MASTER_KEY` e `INTEGRATIONS_ENC_KEY` deben ser idénticos a los del VPS o pierdes acceso a datos cifrados existentes.
