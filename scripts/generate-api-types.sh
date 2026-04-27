#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Codegen pipeline (Fase 1.1):
#   server/src/openapi.ts  →  server/openapi.json  →  services/__generated__/api-types.ts
#
# Por qué este pipeline:
#   - El openapi.ts del backend es la fuente de verdad del contrato HTTP.
#   - Exportarlo a JSON desacopla el codegen del runtime de Node.
#   - openapi-typescript genera `paths` y `components` typesafe que el frontend
#     puede consumir sin re-declarar shapes manualmente (ver `services/api`).
#
# Uso:
#   ./scripts/generate-api-types.sh           # genera types
#   ./scripts/generate-api-types.sh --check   # falla si los types están desactualizados (CI gate)
#
# Flujo en CI: correr en `--check`. Si difiere, romper el build con instrucciones.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/server"
SPEC_JSON="$SERVER_DIR/openapi.json"
TYPES_OUT="$ROOT/services/__generated__/api-types.ts"

CHECK_MODE=false
[ "${1:-}" = "--check" ] && CHECK_MODE=true

echo "[codegen] exporting OpenAPI spec from server/src/openapi.ts..."
cd "$SERVER_DIR"
npx tsx scripts/export-openapi.ts "$SPEC_JSON"

if $CHECK_MODE; then
  TMP=$(mktemp -t api-types.XXXXXX.ts)
  trap 'rm -f "$TMP"' EXIT
  echo "[codegen] generating types into temp file (check mode)..."
  cd "$ROOT"
  npx openapi-typescript "$SPEC_JSON" --output "$TMP" >/dev/null
  if ! diff -q "$TYPES_OUT" "$TMP" >/dev/null 2>&1; then
    echo "❌ services/__generated__/api-types.ts está desactualizado." >&2
    echo "   Corre: ./scripts/generate-api-types.sh && commit del cambio." >&2
    diff -u "$TYPES_OUT" "$TMP" | head -40 >&2 || true
    exit 1
  fi
  echo "[codegen] ✓ types up-to-date with openapi.ts"
else
  echo "[codegen] generating types..."
  cd "$ROOT"
  mkdir -p "$(dirname "$TYPES_OUT")"
  npx openapi-typescript "$SPEC_JSON" --output "$TYPES_OUT"
  echo "[codegen] ✓ wrote $TYPES_OUT"
fi
