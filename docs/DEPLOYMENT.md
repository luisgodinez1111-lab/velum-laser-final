# Deploy (VPS + Docker + Nginx)

## 1) Build frontend
- `npm install`
- `npm run build`
- Servir `dist/` con Nginx o un static server.

## 2) Backend API
- Configurar variables en `server/.env`.
- `docker compose up -d postgres`
- `cd server && npm install`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run build`
- `npm run start`

## 3) Nginx
- Copia `deploy/nginx.conf` a `/etc/nginx/sites-available/velum`
- Actualiza `server_name` con tu dominio.
- Habilita el sitio y reinicia Nginx.
- Configura SSL con Certbot:
  - `sudo certbot --nginx -d tu-dominio.com`

## 4) Webhooks
- En Stripe, configura el endpoint: `https://tu-dominio.com/api/stripe/webhook`
- Copia el secret a `STRIPE_WEBHOOK_SECRET`.
