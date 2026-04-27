#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Restore-test (Fase 0.7) — el único backup que importa es el que se restaura.
#
# Qué hace:
#   1. Toma el .sql.gz más reciente en BACKUP_DIR (o el archivo pasado por arg).
#   2. Crea una DB efímera `velum_restore_test` en el mismo contenedor Postgres.
#   3. Restaura el dump dentro de esa DB.
#   4. Corre smoke tests de integridad (counts, FKs, tenant root, último appointment).
#   5. Reporta resultados — exit code != 0 si algo falla.
#   6. Limpia la DB efímera siempre.
#
# Cuándo correr:
#   - Manual antes de cualquier migración riesgosa (ej: RLS, rename masivo).
#   - Cron semanal para detectar backups corruptos antes de necesitarlos.
#
# Uso:
#   ./scripts/db-restore-test.sh                      # último backup de BACKUP_DIR
#   ./scripts/db-restore-test.sh /ruta/a/dump.sql.gz  # backup específico
#
# Cron sugerido (domingos 04:00):
#   0 4 * * 0 /home/velumadmin/velum-laser-final/scripts/db-restore-test.sh \
#     >> /var/log/velum-restore-test.log 2>&1
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/velumadmin/backups/db}"
CONTAINER="${DB_CONTAINER:-velum-laser-final-postgres-1}"
DB_USER="${DB_USER:-postgres}"
TEST_DB="${TEST_DB:-velum_restore_test}"

# ── 1. Localizar dump ─────────────────────────────────────────────────────────
DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP=$(ls -1t "$BACKUP_DIR"/velum_*.sql.gz 2>/dev/null | head -1 || true)
  if [ -z "$DUMP" ]; then
    echo "ERROR: no se encontraron backups en $BACKUP_DIR" >&2
    exit 1
  fi
fi
if [ ! -f "$DUMP" ]; then
  echo "ERROR: dump no existe: $DUMP" >&2
  exit 1
fi

START_TS=$(date +%s)
echo "[$(date -Is)] Restore-test starting — dump: $DUMP"

# ── 2. Validar que el contenedor de Postgres está vivo ────────────────────────
if ! docker exec "$CONTAINER" pg_isready -U "$DB_USER" -q; then
  echo "ERROR: Postgres no está respondiendo en $CONTAINER" >&2
  exit 2
fi

# ── 3. Garantizar limpieza incluso si fallamos a mitad ────────────────────────
cleanup() {
  echo "[$(date -Is)] Cleanup: dropping $TEST_DB"
  docker exec "$CONTAINER" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── 4. Crear DB efímera y restaurar ───────────────────────────────────────────
echo "[$(date -Is)] Creating ephemeral DB $TEST_DB"
docker exec "$CONTAINER" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null
docker exec "$CONTAINER" psql -U "$DB_USER" -c "CREATE DATABASE \"$TEST_DB\";" >/dev/null

echo "[$(date -Is)] Restoring dump..."
gunzip -c "$DUMP" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 >/dev/null

# ── 5. Smoke tests de integridad ──────────────────────────────────────────────
# Cada query devuelve un valor que validamos. Si la DB está rota, fallan acá.
echo "[$(date -Is)] Running smoke tests..."

run_query() {
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -tAc "$1"
}

# 5.1 Tenant root debe existir (post-Fase 0.1).
TENANT_COUNT=$(run_query "SELECT COUNT(*) FROM \"Tenant\" WHERE id = 'default';")
if [ "$TENANT_COUNT" != "1" ]; then
  echo "FAIL: Tenant 'default' no existe en el dump" >&2
  exit 10
fi

# 5.2 FKs activas (post-Fase 0.2).
FK_COUNT=$(run_query "SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE '%clinicId_fkey';")
if [ "$FK_COUNT" -lt 4 ]; then
  echo "FAIL: faltan FKs de tenant — esperado 4, encontrado $FK_COUNT" >&2
  exit 11
fi

# 5.3 Tablas críticas con datos coherentes.
USERS=$(run_query "SELECT COUNT(*) FROM \"User\";")
APPTS=$(run_query "SELECT COUNT(*) FROM \"Appointment\";")
PAYMENTS=$(run_query "SELECT COUNT(*) FROM \"Payment\";")
MIGRATIONS=$(run_query "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")

# 5.4 Integridad referencial — ningún user huérfano de tenant.
ORPHANS=$(run_query "SELECT COUNT(*) FROM \"User\" u LEFT JOIN \"Tenant\" t ON u.\"clinicId\" = t.id WHERE t.id IS NULL;")
if [ "$ORPHANS" != "0" ]; then
  echo "FAIL: $ORPHANS users huérfanos (clinicId sin Tenant)" >&2
  exit 12
fi

# 5.5 Schema mínimo: enums críticos presentes.
ENUMS=$(run_query "SELECT COUNT(*) FROM pg_type WHERE typname IN ('Role','AppointmentStatus','TenantStatus','PaymentStatus');")
if [ "$ENUMS" != "4" ]; then
  echo "FAIL: enums esperados no presentes (Role, AppointmentStatus, TenantStatus, PaymentStatus) — encontrados $ENUMS" >&2
  exit 13
fi

ELAPSED=$(( $(date +%s) - START_TS ))
echo "[$(date -Is)] ✓ Restore-test OK — users=$USERS appts=$APPTS payments=$PAYMENTS migrations=$MIGRATIONS  elapsed=${ELAPSED}s  dump=$(du -h "$DUMP" | cut -f1)"
