#!/usr/bin/env bash
# Velum Laser — Smoke test rápido post-deploy
# Uso: ./scripts/smoke-test.sh [BASE_URL]
# Ejemplo: ./scripts/smoke-test.sh https://api.velumlaser.com
#
# Para un test más completo (seeds, migraciones, DB), usa smoke-postdeploy.sh
set -euo pipefail

BASE_URL="${1:-http://localhost:4000}"

echo "🔍 Smoke test → $BASE_URL"

check() {
  local desc="$1" url="$2" expected="$3"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")
  if [ "$status" = "$expected" ]; then
    echo "  ✓ $desc ($status)"
  else
    echo "  ✗ $desc — esperado $expected, obtenido $status"
    exit 1
  fi
}

check "Health check"           "$BASE_URL/api/health"                       200
check "Auth endpoint (no auth)" "$BASE_URL/api/v1/auth/me"                  401
check "Stripe webhook alive"   "$BASE_URL/api/stripe/webhook"               200
check "Ruta inexistente → 404" "$BASE_URL/api/v1/ruta-que-no-existe-xyz"   404

echo "✅ Todos los checks pasaron"
