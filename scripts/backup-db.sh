#!/usr/bin/env bash
# PostgreSQL backup — dumps the velum DB via Docker, keeps last 14 days.
# Usage: ./scripts/backup-db.sh
# Recommended cron (daily at 03:00):
#   0 3 * * * /home/velumadmin/velum-laser-final/scripts/backup-db.sh >> /var/log/velum-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/velumadmin/backups/db}"
CONTAINER="${DB_CONTAINER:-velum-laser-final-postgres-1}"
DB_NAME="${DB_NAME:-velum}"
DB_USER="${DB_USER:-postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILE="$BACKUP_DIR/velum_${TIMESTAMP}.sql.gz"

echo "[$(date -Is)] Starting backup → $FILE"

docker exec "$CONTAINER" \
  pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip -9 > "$FILE"

SIZE=$(du -sh "$FILE" | cut -f1)
echo "[$(date -Is)] Backup complete — $SIZE"

# Verificación de integridad — un .sql.gz corrupto no se descubre hasta el restore.
# `gzip -t` valida el stream entero. Sin esto, podríamos guardar 14 días de basura.
if ! gzip -t "$FILE"; then
  echo "[$(date -Is)] ERROR: backup corrupto detectado — $FILE" >&2
  rm -f "$FILE"
  exit 1
fi
echo "[$(date -Is)] gzip integrity OK"

# Remove backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "velum_*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "[$(date -Is)] Old backups pruned (kept last ${KEEP_DAYS} days)"
