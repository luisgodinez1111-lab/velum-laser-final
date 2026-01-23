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

## Docker Compose (frontend + api + postgres + nginx)
```bash
cp .env.example .env
cp server/.env.example server/.env
docker compose up --build
```

## Deploy
Guía completa en `docs/DEPLOYMENT.md`.
