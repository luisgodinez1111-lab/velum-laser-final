# Umami self-hosted — Setup operativo

Analytics privacy-friendly bajo `/stats` del dominio principal. Cero datos a
Google. Reusa el Postgres existente con database aislado.

## 1. Variables de entorno

Agrega a `server/.env` (o donde tengas tus env vars compose):

```bash
# Generar APP_SECRET único: openssl rand -hex 64
UMAMI_APP_SECRET=__pegar_64_chars_random_aqui__

# Reusa POSTGRES_PASSWORD existente. Database 'umami' separado del de velum.
UMAMI_DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/umami
```

Generar el secret en una terminal:

```bash
openssl rand -hex 64
```

## 2. Crear database `umami` en Postgres existente

UNA sola vez, antes del primer arranque de Umami:

```bash
docker compose exec postgres psql -U postgres -c "CREATE DATABASE umami;"
```

Verifica:

```bash
docker compose exec postgres psql -U postgres -l | grep umami
# debe aparecer: umami | postgres | UTF8 ...
```

## 3. Levantar el servicio Umami

```bash
docker compose up -d umami
docker compose logs -f umami
```

Espera a ver `🚀 Server is running` (toma ~1 min en primer arranque porque
Umami corre las migraciones automáticamente).

## 4. Reiniciar nginx para activar la ruta `/stats`

```bash
docker compose up -d --no-deps nginx
```

## 5. Acceder al panel admin

Abre `https://velumlaser.com/stats` en el navegador.

**Login inicial:**
- Usuario: `admin`
- Password: `umami`

**Cambiar el password inmediatamente:**
- Click en perfil arriba a la derecha → Profile → Change password.
- Usar password fuerte (>=16 chars).

## 6. Registrar el sitio para obtener `website-id`

En el panel Umami:

1. Click "Add website" o "Settings → Websites → Add"
2. Name: `VELUM Laser`
3. Domain: `velumlaser.com`
4. Save → te da un **Website ID** (UUID tipo `f1234abc-...`)

## 7. Pegar el website-id en `index.html`

Edita `index.html`, busca el placeholder y reemplázalo:

```html
<script defer src="/stats/script.js" data-website-id="f1234abc-tu-uuid-real-aqui"></script>
```

Commit, push, deploy nginx (rebuild + restart).

## 8. Verificar tracking en vivo

1. Abre `velumlaser.com` en una pestaña
2. En otra pestaña, abre `velumlaser.com/stats`
3. En el dashboard de Umami debes ver "1 visitor active" en tiempo real

Si no aparece:
- Revisa la consola del navegador (F12) — busca errores 404 sobre `/stats/script.js`
- Verifica que `data-website-id` sea el UUID correcto, no el placeholder

## 9. Hardening (recomendado)

### 9a. Restringir acceso al panel `/stats` por IP

Si quieres que solo tu IP pueda ver el dashboard pero el script `/stats/script.js`
sea accesible para todos los visitantes:

```nginx
# En deploy/nginx.conf, reemplazar el location /stats/ por:
location /stats/script.js {
  proxy_pass http://umami:3000;
  proxy_set_header Host $host;
}
location /stats/api/send {
  proxy_pass http://umami:3000;
  proxy_set_header Host $host;
}
location /stats/ {
  allow TU.IP.PUBLICA;
  deny all;
  proxy_pass http://umami:3000;
  proxy_set_header Host $host;
}
```

### 9b. Backup del database umami

Agregar a `deploy/backup-postgres.sh` para incluir la database umami en backups
(probablemente ya hace `pg_dumpall` que la cubre).

## 10. Métricas a observar (rediseño Dashboard)

Después de Fase 12 desplegada, configurar en Umami eventos custom:

- `agendar_click` — paciente click "Agendar"
- `feedback_submit` — paciente envía feedback de sesión
- `tab_change` — paciente cambia de tab Dashboard

En el código frontend, llamar:

```ts
window.umami?.track('agendar_click');
```

Después de 30 días tendrás suficiente data para responder:
- ¿Tiempo desde login hasta agendar bajó de X a Y?
- ¿Cuántos pacientes envían feedback? (target: >40%)
- ¿Qué tab se visita más después del rediseño?

## Troubleshooting

**Error: "Database connection failed" al arrancar Umami**
- Verifica que la database `umami` exista (paso 2).
- Verifica que `UMAMI_DATABASE_URL` apunte a `postgres:5432` (nombre del service en compose, no `localhost`).

**Error: "Script.js 404"**
- nginx no está pasando `/stats/script.js` al servicio Umami. Revisar `deploy/nginx.conf` location `/stats/`.

**Panel Umami carga pero el sidebar tiene URLs `/dashboard` (sin /stats)**
- `BASE_PATH` no está configurado. Revisar env var en `docker-compose.yml`.
- Restart: `docker compose up -d --force-recreate umami`.

**Los eventos no se registran (Umami panel muestra 0 visitors)**
- Abre F12 → Network → busca `/stats/api/send`. Si es 404, nginx no está enrutando.
- Si es 200 pero panel sigue en 0, el `data-website-id` está mal.
