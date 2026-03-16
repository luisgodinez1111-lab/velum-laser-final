#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Velum Laser — PostgreSQL automated backup
# Stores daily snapshots for 30 days, weekly for 12 weeks
# Run as: crontab -e → 0 3 * * * /opt/velum/deploy/backup-postgres.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="/home/velumadmin/velum-laser-final/docker-compose.yml"
BACKUP_DIR="/home/velumadmin/backups/postgres"
DB_CONTAINER="velum-laser-final-postgres-1"
DB_USER="velumapp"
DB_NAME="velum"
RETENTION_DAILY=30   # keep last 30 daily backups
RETENTION_WEEKLY=12  # keep last 12 weekly backups (Sundays)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DOW=$(date +"%u") # 1=Mon … 7=Sun

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"

DUMP_FILE="${BACKUP_DIR}/daily/velum_${TIMESTAMP}.sql.gz"

# Create dump inside container, stream out via docker exec
docker exec "${DB_CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --no-password \
  | gzip > "${DUMP_FILE}"

echo "[backup] Created: ${DUMP_FILE} ($(du -sh "${DUMP_FILE}" | cut -f1))"

# Copy to weekly if today is Sunday
if [ "${DOW}" = "7" ]; then
  cp "${DUMP_FILE}" "${BACKUP_DIR}/weekly/velum_weekly_${TIMESTAMP}.sql.gz"
  echo "[backup] Weekly copy saved"
fi

# Prune old daily backups
find "${BACKUP_DIR}/daily" -name "*.sql.gz" -mtime +${RETENTION_DAILY} -delete
echo "[backup] Pruned daily backups older than ${RETENTION_DAILY} days"

# Prune old weekly backups
WEEKLY_COUNT=$(ls -1 "${BACKUP_DIR}/weekly" | wc -l)
if [ "${WEEKLY_COUNT}" -gt "${RETENTION_WEEKLY}" ]; then
  ls -1t "${BACKUP_DIR}/weekly" | tail -n +$((RETENTION_WEEKLY + 1)) | \
    xargs -I{} rm "${BACKUP_DIR}/weekly/{}"
  echo "[backup] Pruned weekly backups beyond ${RETENTION_WEEKLY}"
fi

echo "[backup] Done at $(date)"
