<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# VELUM - Plataforma de membresías

## Requisitos
- Node.js 20+
- Docker + Docker Compose
- Stripe keys (test/live)

## Desarrollo local
```bash
npm install
npm run dev
```

### Backend (API)
```bash
cd server
npm install
cp .env.example .env
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

API docs: `http://localhost:4000/docs`

Contrato OpenAPI v1 (snapshot YAML): `docs/openapi-v1.yaml`

### Variables nuevas (Google Calendar)
Configura también estas variables en `server/.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (ej: `https://tu-dominio/api/integrations/google-calendar/callback`)
- `INTEGRATIONS_ENC_KEY` (clave para cifrar tokens OAuth)
- `BASE_URL` (URL pública API para webhooks, ej: `https://tu-dominio`)
- `DEFAULT_CLINIC_ID` (fallback multi-tenant)
- `GOOGLE_SYNC_IGNORE_WINDOW_SECONDS` (ventana anti-loop, default `10`)
- `REDIS_URL` (opcional, solo si migras a BullMQ)

## Docker Compose (frontend + api + postgres + nginx)
```bash
cp .env.example .env
cp server/.env.example server/.env
docker compose up --build
```

## Deploy
Guía completa en `docs/DEPLOYMENT.md`.
Runbook de release/rollback: `docs/RUNBOOK_RELEASE.md`.
