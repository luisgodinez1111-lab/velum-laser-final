#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Velum Laser — Rotación de credenciales locales (JWT + AES)
#
# Este script regenera JWT_SECRET e INTEGRATIONS_ENC_KEY en server/.env.
# Ejecutar solo cuando todas las sesiones activas puedan invalidarse.
#
# IMPORTANTE — Pasos manuales ANTES de correr este script:
#   1. Stripe: dashboard.stripe.com > Developers > API keys > Roll key
#   2. Stripe webhook: dashboard.stripe.com > Webhooks > Roll secret
#   3. Resend: resend.com/api-keys > Rotar las 6 keys
#   4. Google Calendar: si INTEGRATIONS_ENC_KEY cambia, reconectar GCal desde el panel admin
#
# CONSECUENCIAS de correr este script:
#   - Todos los usuarios quedan deslogueados (JWT_SECRET nuevo invalida sesiones activas)
#   - Google Calendar Integration queda desconectada (tokens AES cifrados con clave vieja)
#
# Uso: bash scripts/rotate-secrets.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="$(dirname "$0")/../server/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: No se encontró server/.env en ${ENV_FILE}"
  exit 1
fi

echo ""
echo "===================================================================="
echo " Velum Laser — Rotación de credenciales locales"
echo "===================================================================="
echo ""
echo " ADVERTENCIA: Este script invalidará todas las sesiones activas"
echo " y desconectará Google Calendar."
echo ""
read -rp " ¿Confirmás la rotación? (escribe 'ROTAR' para continuar): " confirm

if [ "$confirm" != "ROTAR" ]; then
  echo "Cancelado."
  exit 0
fi

# Backup del .env actual
BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
echo ""
echo "[rotate] Backup guardado: ${BACKUP}"

# Generar nuevos valores
NEW_JWT=$(openssl rand -hex 64)
NEW_ENC=$(openssl rand -hex 32)

# Reemplazar en .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_JWT}|" "$ENV_FILE"
sed -i "s|^INTEGRATIONS_ENC_KEY=.*|INTEGRATIONS_ENC_KEY=${NEW_ENC}|" "$ENV_FILE"

echo "[rotate] JWT_SECRET     → regenerado (64 bytes hex)"
echo "[rotate] INTEGRATIONS_ENC_KEY → regenerado (32 bytes hex)"
echo ""
echo "===================================================================="
echo " Pasos siguientes (MANUALES — requieren dashboards externos):"
echo "===================================================================="
echo ""
echo " [ ] 1. Stripe Secret Key:"
echo "        dashboard.stripe.com > Developers > API keys > Roll key"
echo "        Actualizar STRIPE_SECRET_KEY en server/.env"
echo ""
echo " [ ] 2. Stripe Webhook Secret:"
echo "        dashboard.stripe.com > Webhooks > seleccionar endpoint > Roll secret"
echo "        Actualizar STRIPE_WEBHOOK_SECRET en server/.env"
echo ""
echo " [ ] 3. Resend API keys (6 keys):"
echo "        resend.com/api-keys > crear nuevas y revocar las anteriores"
echo "        Actualizar RESEND_KEY_VERIFICATION, RESET, REMINDERS,"
echo "        DOCUMENTS, ADMIN_INVITE, NOTIFICATIONS en server/.env"
echo ""
echo " [ ] 4. PostgreSQL password (si es necesario):"
echo "        docker compose exec postgres psql -U postgres -c"
echo "        \"ALTER USER velumapp PASSWORD 'nueva_pass_segura';\""
echo "        Actualizar DATABASE_URL en server/.env"
echo ""
echo " [ ] 5. Redeploy del API:"
echo "        docker compose up -d --no-deps api"
echo ""
echo " [ ] 6. Reconectar Google Calendar desde el panel admin"
echo "        (los tokens anteriores quedaron cifrados con clave vieja)"
echo ""
echo "[rotate] Completado. No olvides el redeploy."
