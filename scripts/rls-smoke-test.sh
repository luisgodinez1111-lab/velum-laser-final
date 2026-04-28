#!/usr/bin/env bash
# rls-smoke-test.sh — verifica que endpoints clave responden 2xx con sesión admin.
# Útil antes y después de flippear RLS_ENFORCE para detectar regresiones rápido.
#
# Uso:
#   ADMIN_EMAIL=luisgodinez544@icloud.com ADMIN_PASS='...' \
#     ./scripts/rls-smoke-test.sh [base_url]
#
# Default base_url: https://localhost (curl -k para self-signed local).
# Si todos los endpoints responden 2xx → exit 0. Si alguno falla → exit 1.

set -euo pipefail

BASE_URL="${1:-https://localhost}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASS:-}" ]; then
  echo "ERROR: define ADMIN_EMAIL y ADMIN_PASS en el entorno."
  echo "  ADMIN_EMAIL=admin@x.com ADMIN_PASS='...' ./scripts/rls-smoke-test.sh"
  exit 2
fi

CURL_OPTS="-sk -b $COOKIE_JAR -c $COOKIE_JAR"
TOTAL=0
FAILED=0

# 1) Login como admin
echo "─── 1/6 POST /api/auth/login ────────────────────────────────"
LOGIN_BODY=$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASS")
LOGIN_STATUS=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" -d "$LOGIN_BODY" \
  "$BASE_URL/api/auth/login")
TOTAL=$((TOTAL+1))
if [ "$LOGIN_STATUS" != "200" ]; then
  echo "  ✗ Login falló (HTTP $LOGIN_STATUS) — abortando"
  exit 1
fi
echo "  ✓ Login OK"

# Endpoints a validar — par "RUTA STATUS_ESPERADO"
ENDPOINTS=(
  "/api/users/me 200"
  "/api/admin/reports 200"
  "/api/admin/users?limit=10 200"
  "/api/v1/agenda/admin/config 200"
  "/api/v1/audit-logs?limit=5 200"
)

i=2
for entry in "${ENDPOINTS[@]}"; do
  PATH_PART=$(echo "$entry" | awk '{print $1}')
  EXPECTED=$(echo "$entry" | awk '{print $2}')
  echo "─── $i/6 GET $PATH_PART ──────────"
  STATUS=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" "$BASE_URL$PATH_PART")
  TOTAL=$((TOTAL+1))
  if [ "$STATUS" = "$EXPECTED" ]; then
    echo "  ✓ HTTP $STATUS"
  else
    echo "  ✗ HTTP $STATUS (esperado $EXPECTED)"
    FAILED=$((FAILED+1))
  fi
  i=$((i+1))
done

echo
echo "─── Resumen ─────────────────────────────────────────────────"
echo "  Total: $TOTAL · Fallidos: $FAILED"
if [ "$FAILED" -gt 0 ]; then
  echo "  ✗ SMOKE TEST FAILED"
  exit 1
fi
echo "  ✓ SMOKE TEST OK"
