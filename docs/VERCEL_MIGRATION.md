# Migracion de Railway/VPS a Vercel

Fecha: 2026-04-26

## Estrategia

La migracion se hace en dos fases para no romper pagos, cookies, uploads ni jobs.

1. Frontend en Vercel.
2. Backend y workers despues, cuando storage y jobs ya no dependan de filesystem/intervalos.

## Fase 1: frontend en Vercel

Este repositorio ya incluye:

- `vercel.json` para Vite.
- `.vercelignore` para desplegar solo el frontend.
- `.env.example` con `VITE_API_URL` externo.

Configura el proyecto Vercel con:

- Framework Preset: `Vite`
- Install Command: `npm install --legacy-peer-deps`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variable:

```bash
VITE_API_URL=https://api.tu-dominio.com
```

Si el backend sigue temporalmente en Railway, usa la URL publica del backend:

```bash
VITE_API_URL=https://velum-api-production.up.railway.app
```

## Backend durante la transicion

El backend debe aceptar el origen de Vercel:

```bash
APP_URL=https://tu-proyecto.vercel.app
API_URL=https://api.tu-dominio.com
CORS_ORIGIN=https://tu-proyecto.vercel.app,https://tu-dominio.com
```

Para cookies cross-site temporales entre `vercel.app` y Railway:

```bash
COOKIE_SAME_SITE=none
COOKIE_DOMAIN=
NODE_ENV=production
```

Para produccion final con dominio propio compartido:

```bash
APP_URL=https://tu-dominio.com
API_URL=https://api.tu-dominio.com
CORS_ORIGIN=https://tu-dominio.com
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=.tu-dominio.com
PRIMARY_DOMAIN=tu-dominio.com
REQUIRE_KNOWN_TENANT=true
ALLOW_TENANT_HEADERS=false
```

## Deploy con Vercel CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add VITE_API_URL production
vercel --prod
```

## Lo que no debe moverse todavia a Vercel Functions

No mover aun estos componentes sin refactor:

- uploads locales `UPLOAD_DIR`
- `OUTBOX_WORKER_ENABLED=true`
- `AGENT_WORKER_ENABLED=true`
- Docker Compose Postgres

Para mover backend completo a Vercel hace falta:

- Postgres gestionado con `DATABASE_URL` publica y SSL.
- storage object-store: Vercel Blob, S3 o R2.
- workers convertidos a Cron Jobs/Queues.
- migraciones Prisma ejecutadas desde CI o comando controlado, no desde cada request.
