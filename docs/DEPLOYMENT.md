# Deploy VPS Hetzner (Docker + Nginx + Postgres)

> Objetivo: levantar frontend + backend + PostgreSQL en el mismo VPS (CX33) usando Docker y Nginx como reverse proxy.

## 1) Preparación del VPS
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw curl git
```

### Instalar Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### Firewall (UFW)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 2) Configurar proyecto
```bash
git clone <tu-repo> velum
cd velum
```

### Variables de entorno
```bash
cp .env.example .env
cp server/.env.example server/.env
```

Editar `server/.env`:
- `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/velum`
- `JWT_SECRET=<valor-largo>`
- `STRIPE_SECRET_KEY=<sk_live>`
- `STRIPE_WEBHOOK_SECRET=<whsec>`
- `STRIPE_PORTAL_RETURN_URL=https://tu-dominio.com/account`
- `UPLOAD_DIR=/var/velum/uploads`
- `APP_URL=https://tu-dominio.com`

> Nota: el frontend usa `HashRouter`, por lo que los redirects de Stripe incluyen `/#/dashboard`.

### Variables de entorno requeridas (backend)
- `NODE_ENV`
- `PORT`
- `APP_URL`
- `API_URL`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `COOKIE_NAME`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PORTAL_RETURN_URL`
- `UPLOAD_DIR`
- `UPLOAD_MAX_SIZE`
- `GRACE_PERIOD_DAYS`
- `META_ENABLED`
- `META_API_VERSION`
- `META_PIXEL_ID`
- `META_ACCESS_TOKEN`
- `APPOINTMENT_RESCHEDULE_MIN_HOURS`
- `LOG_LEVEL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

### Variables de entorno requeridas (frontend)
- `VITE_API_URL` (ej: `/api` o `https://tu-dominio.com/api`)

Crear directorio de uploads en el VPS:
```bash
sudo mkdir -p /var/velum/uploads
sudo chown -R 1000:1000 /var/velum/uploads
```

Directorio para desafíos ACME:
```bash
sudo mkdir -p /var/www/certbot
```

## 3) Levantar servicios (Docker Compose)
```bash
docker compose up -d --build
```

### Migraciones y seed inicial
El contenedor API ejecuta automáticamente:
- `prisma generate`
- `prisma migrate deploy`
- `seed` si `RUN_SEED=true` (útil para crear el admin inicial)

## 4) Configuración de Nginx
Editar `deploy/nginx.conf` y actualizar:
```
server_name tu-dominio.com www.tu-dominio.com;
```

Reiniciar contenedor Nginx:
```bash
docker compose up -d --build nginx
```

## 5) SSL con Let's Encrypt (Certbot)
Usa Certbot con webroot (recomendado):
```bash
sudo apt install -y certbot
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d tu-dominio.com -d www.tu-dominio.com
```

Montar certificados en el contenedor Nginx (ejemplo):
```yaml
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

Actualizar Nginx para escuchar en 443 con TLS (ejemplo):
```
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;
```

## 6) Stripe Webhooks
Configurar en Stripe:
```
https://tu-dominio.com/api/stripe/webhook
```
Eventos:
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `checkout.session.completed`

## 7) Backups
### PostgreSQL (diario con cron)
```bash
0 2 * * * docker exec velum-postgres-1 pg_dump -U postgres velum > /var/backups/velum_db_$(date +\%F).sql
```

### Uploads
```bash
0 3 * * * tar -czf /var/backups/velum_uploads_$(date +\%F).tgz /var/velum/uploads
```

### Restauración
```bash
cat /var/backups/velum_db_2024-01-01.sql | docker exec -i velum-postgres-1 psql -U postgres velum
tar -xzf /var/backups/velum_uploads_2024-01-01.tgz -C /
```

## 8) Tests y smoke checklist
Consulta `docs/TESTING.md`.

## 9) Runbook de incidentes y rollback
Consulta `docs/RUNBOOK_RELEASE.md`.
