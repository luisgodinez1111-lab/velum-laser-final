<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/temp/1

## Run Locally (Frontend)

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run Locally (Backend API)

**Prerequisites:** Node.js 20+, Docker (PostgreSQL), Stripe test keys, S3-compatible storage.

1. Go to the backend folder:
   `cd server`
2. Install dependencies:
   `npm install`
3. Copy environment variables:
   `cp .env.example .env`
4. Start database:
   `docker compose up -d postgres`
5. Run Prisma (generate + migrate):
   `npm run prisma:generate`
6. Start API:
   `npm run dev`

API docs: `http://localhost:4000/docs`

## Docker Compose (API + Postgres)

`docker compose up --build`
