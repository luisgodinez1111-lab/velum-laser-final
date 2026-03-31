#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Velum Laser — PostgreSQL automated backup
# - Daily snapshots, retención 30 días
# - Copia semanal (domingos), retención 12 semanas
# - Verificación de integridad gzip tras el dump
# - Alerta via ERROR_WEBHOOK_URL si falla cualquier paso
#
# Cron (configurado en crontab -l):
#   0 3 * * * /home/velumadmin/velum-laser-final/deploy/backup-postgres.sh >> /home/velumadmin/backups/backup.log 2>&1
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="/home/velumadmin/backups/postgres"
DB_CONTAINER="velum-laser-final-postgres-1"
DB_USER="velumapp"
DB_NAME="velum"
RETENTION_DAILY=30
RETENTION_WEEKLY=12
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DOW=$(date +"%u")   # 1=Lun … 7=Dom
ENV_FILE="/home/velumadmin/velum-laser-final/server/.env"

# Leer ERROR_WEBHOOK_URL del .env si existe
WEBHOOK_URL=""
if [ -f "$ENV_FILE" ]; then
  WEBHOOK_URL=$(grep -E "^ERROR_WEBHOOK_URL=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
fi

# ── Función de alerta ────────────────────────────────────────────────────────
notify_failure() {
  local msg="$1"
  echo "[backup][ERROR] ${msg}" >&2
  if [ -n "$WEBHOOK_URL" ]; then
    curl -s -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"Velum Backup FAILED: ${msg} — $(date -Is)\"}" \
      --max-time 10 || true
  fi
}

# ── Trap para capturar fallos inesperados ─────────────────────────────────────
trap 'notify_failure "Script terminó inesperadamente en línea ${LINENO}"' ERR

# ── Preparar directorios ──────────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"

DUMP_FILE="${BACKUP_DIR}/daily/velum_${TIMESTAMP}.sql.gz"

echo "[backup][$(date -Is)] Iniciando dump -> ${DUMP_FILE}"

# ── Verificar que el contenedor está corriendo ────────────────────────────────
if ! docker inspect "$DB_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
  notify_failure "Contenedor ${DB_CONTAINER} no está corriendo"
  exit 1
fi

# ── Dump comprimido ───────────────────────────────────────────────────────────
docker exec "${DB_CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --no-password \
  | gzip -9 > "${DUMP_FILE}"

# ── Verificación de integridad ────────────────────────────────────────────────
if ! gzip -t "${DUMP_FILE}" 2>/dev/null; then
  notify_failure "Verificación gzip falló — archivo corrupto: ${DUMP_FILE}"
  rm -f "${DUMP_FILE}"
  exit 1
fi

FILE_SIZE=$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")
# Alerta si el dump es menor a 10 KB — señal de dump vacío o fallo silencioso
MIN_SIZE_BYTES=10240
if [ "${FILE_SIZE}" -lt "${MIN_SIZE_BYTES}" ]; then
  notify_failure "Dump sospechosamente pequeño (${FILE_SIZE} bytes < ${MIN_SIZE_BYTES}): ${DUMP_FILE}"
  exit 1
fi

HUMAN_SIZE=$(du -sh "${DUMP_FILE}" | cut -f1)
echo "[backup][$(date -Is)] Dump OK — ${HUMAN_SIZE} — integridad verificada"

# ── Copia semanal (domingos) ──────────────────────────────────────────────────
if [ "${DOW}" = "7" ]; then
  WEEKLY_FILE="${BACKUP_DIR}/weekly/velum_weekly_${TIMESTAMP}.sql.gz"
  cp "${DUMP_FILE}" "${WEEKLY_FILE}"
  echo "[backup] Copia semanal guardada: ${WEEKLY_FILE}"
fi

# ── Pruning de backups antiguos ───────────────────────────────────────────────
find "${BACKUP_DIR}/daily" -name "*.sql.gz" -mtime +"${RETENTION_DAILY}" -delete
echo "[backup] Daily: backups >${RETENTION_DAILY} dias eliminados"

WEEKLY_COUNT=$(ls -1 "${BACKUP_DIR}/weekly" 2>/dev/null | wc -l)
if [ "${WEEKLY_COUNT}" -gt "${RETENTION_WEEKLY}" ]; then
  ls -1t "${BACKUP_DIR}/weekly" | tail -n +"$((RETENTION_WEEKLY + 1))" | \
    xargs -I{} rm -f "${BACKUP_DIR}/weekly/{}"
  echo "[backup] Weekly: backups >${RETENTION_WEEKLY} semanas eliminados"
fi

echo "[backup][$(date -Is)] Completado exitosamente"
