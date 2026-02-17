#!/usr/bin/env sh
set -eu

BASE="${BASE:-http://localhost:4000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@velum.mx}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-TempPass123456!}"
FAIL=0

assert_code() {
  label="$1"
  expected="$2"
  actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "OK   $label -> $actual"
  else
    echo "FAIL $label -> $actual (esperado $expected)"
    FAIL=1
  fi
}

# 1) health
HEALTH="000"
for i in $(seq 1 40); do
  HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health" || true)
  [ "$HEALTH" = "200" ] && break
  sleep 2
done
assert_code "GET /health" "200" "$HEALTH"

# 2) login admin
TOKEN=$(curl -si -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | awk -F'velum_token=' '/[Ss]et-[Cc]ookie: velum_token=/{split($2,a,";"); print a[1]; exit}' \
  | tr -d '\r')

if [ -z "$TOKEN" ]; then
  echo "FAIL login admin: token vacío (revisa ADMIN_EMAIL/ADMIN_PASSWORD)"
  exit 1
fi

# 3) endpoints críticos
CODE_USERS_ME=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: velum_token=$TOKEN" "$BASE/users/me" || true)
assert_code "GET /users/me (admin)" "200" "$CODE_USERS_ME"

CODE_PAY_ME=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: velum_token=$TOKEN" "$BASE/api/v1/payments/me" || true)
assert_code "GET /api/v1/payments/me (admin)" "200" "$CODE_PAY_ME"

CODE_AUDIT_ADMIN=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: velum_token=$TOKEN" "$BASE/api/v1/audit-logs?limit=5" || true)
assert_code "GET /api/v1/audit-logs (admin)" "200" "$CODE_AUDIT_ADMIN"

CODE_AUDIT_PUBLIC=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/audit-logs?limit=5" || true)
assert_code "GET /api/v1/audit-logs (sin auth)" "401" "$CODE_AUDIT_PUBLIC"

LEAD_EMAIL="smoke.$(date +%s)@velum.mx"
CODE_LEAD=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/leads" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Lead\",\"email\":\"$LEAD_EMAIL\",\"phone\":\"+526141110000\",\"consent\":true}" || true)
assert_code "POST /api/v1/leads (public)" "201" "$CODE_LEAD"

CODE_STRIPE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook" \
  -H "Content-Type: application/json" -d '{}' || true)
assert_code "POST /stripe/webhook (firma inválida)" "400" "$CODE_STRIPE"

if [ "$FAIL" -ne 0 ]; then
  echo "SMOKE RESULT: FAIL"
  exit 1
fi

echo "SMOKE RESULT: OK"
