#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Velum Laser — Health check operacional (cron cada 5 minutos)
# Verifica: espacio en disco · contenedores activos · respuesta del API
# Alerta via ERROR_WEBHOOK_URL si cualquier check falla.
#
# Agregar al crontab:
#   */5 * * * * /home/velumadmin/velum-laser-final/deploy/ops-healthcheck.sh >> /var/log/velum-ops-health.log 2>&1
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="/home/velumadmin/velum-laser-final/server/.env"
DISK_WARN_PERCENT=80      # Alerta cuando el disco supera este % de uso
API_URL="http://localhost/api/health"   # A través de nginx (no directo al puerto 4000)
REQUIRED_CONTAINERS=("velum-laser-final-api-1" "velum-laser-final-postgres-1" "velum-laser-final-nginx-1")

# ── Leer webhook URL ──────────────────────────────────────────────────────────
WEBHOOK_URL=""
if [ -f "$ENV_FILE" ]; then
  WEBHOOK_URL=$(grep -E "^ERROR_WEBHOOK_URL=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
fi

# ── Función de alerta ─────────────────────────────────────────────────────────
notify() {
  local severity="$1"
  local msg="$2"
  local icon="⚠️"
  [ "$severity" = "CRITICAL" ] && icon="🚨"
  echo "[ops-health][${severity}] ${msg}"
  if [ -n "$WEBHOOK_URL" ]; then
    curl -s -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"${icon} Velum OPS [${severity}]: ${msg} — $(date -Is)\"}" \
      --max-time 10 || true
  fi
}

FAILED=0

# ── Check 1: Espacio en disco ─────────────────────────────────────────────────
DISK_USED=$(df / | awk 'NR==2 {gsub(/%/,""); print $5}')
if [ "${DISK_USED}" -ge "${DISK_WARN_PERCENT}" ]; then
  notify "WARN" "Disco raíz al ${DISK_USED}% de uso (umbral: ${DISK_WARN_PERCENT}%)"
  FAILED=1
fi

# ── Check 2: Contenedores activos ─────────────────────────────────────────────
for container in "${REQUIRED_CONTAINERS[@]}"; do
  if ! docker inspect "$container" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    notify "CRITICAL" "Contenedor ${container} NO está corriendo"
    FAILED=1
  fi
done

# ── Check 3: API responde (a través de nginx) ─────────────────────────────────
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_URL" || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  notify "CRITICAL" "API no responde — HTTP ${HTTP_CODE} en ${API_URL}"
  FAILED=1
fi

# ── Check 4: Espacio en directorio de backups ─────────────────────────────────
BACKUP_DIR="/home/velumadmin/backups/postgres/daily"
if [ -d "$BACKUP_DIR" ]; then
  LAST_BACKUP=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime -1 | wc -l)
  if [ "$LAST_BACKUP" -eq 0 ]; then
    notify "WARN" "No se encontró backup diario en las últimas 24h (${BACKUP_DIR})"
    FAILED=1
  fi
fi

if [ "$FAILED" -eq 0 ]; then
  echo "[ops-health][OK] Todos los checks pasaron — $(date -Is)"
fi

exit 0
