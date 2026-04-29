#!/usr/bin/env bash
#
# setup-umami.sh — Setup automático de Umami self-hosted (Fase A)
#
# Uso:
#   ./deploy/setup-umami.sh                         → setup inicial
#   ./deploy/setup-umami.sh --website-id <UUID>     → pegar website-id tras primer login
#
# Idempotente: se puede correr varias veces sin romper nada.

set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

step()  { echo "${BLUE}┃${RESET}  ${BOLD}$1${RESET}"; }
info()  { echo "${BLUE}│${RESET}  $1"; }
ok()    { echo "${GREEN}✓${RESET}  $1"; }
warn()  { echo "${YELLOW}⚠${RESET}  $1"; }
err()   { echo "${RED}✗${RESET}  $1" >&2; }
hr()    { echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ── Pre-requisitos ───────────────────────────────────────────────────────
for cmd in docker openssl sed grep curl awk; do
  if ! command -v "$cmd" &>/dev/null; then
    err "Falta el comando '$cmd'. Instálalo y reintenta."
    exit 1
  fi
done

# Debe correrse desde el root del proyecto (donde está docker-compose.yml).
if [[ ! -f docker-compose.yml ]]; then
  err "No encuentro docker-compose.yml. Corre este script desde el root del proyecto."
  err "  cd ~/velum-laser-final && ./deploy/setup-umami.sh"
  exit 1
fi

# ── Modo: --website-id ───────────────────────────────────────────────────
if [[ "${1:-}" == "--website-id" ]]; then
  WEBSITE_ID="${2:-}"
  if [[ -z "$WEBSITE_ID" ]]; then
    err "Uso: $0 --website-id <UUID>"
    exit 1
  fi
  # Validación básica de UUID v4
  if ! [[ "$WEBSITE_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    err "El UUID no parece válido (formato esperado: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)"
    err "Recibido: $WEBSITE_ID"
    exit 1
  fi

  hr
  step "Pegando website-id en index.html"
  hr

  if grep -q 'REPLACE_ME_WITH_UMAMI_WEBSITE_ID' index.html; then
    sed -i.bak "s|REPLACE_ME_WITH_UMAMI_WEBSITE_ID|$WEBSITE_ID|g" index.html
    rm -f index.html.bak
    ok "index.html actualizado con website-id: $WEBSITE_ID"
  else
    # Buscar si ya hay un UUID válido en data-website-id y reemplazarlo
    if grep -qE 'data-website-id="[0-9a-f-]+"' index.html; then
      sed -i.bak -E "s|data-website-id=\"[0-9a-f-]+\"|data-website-id=\"$WEBSITE_ID\"|g" index.html
      rm -f index.html.bak
      ok "Website-id existente reemplazado por: $WEBSITE_ID"
    else
      warn "No encontré data-website-id en index.html. Verifica manualmente."
      exit 1
    fi
  fi

  step "Rebuild + restart nginx"
  docker compose build nginx
  docker compose up -d --no-deps nginx
  ok "Nginx reiniciado con index.html actualizado"

  echo ""
  hr
  echo "${GREEN}${BOLD}  ✓ Tracking activo${RESET}"
  hr
  echo ""
  echo "  Verifica:"
  echo "    1. Abre https://velumlaser.com en una pestaña"
  echo "    2. Abre https://velumlaser.com/stats en otra"
  echo "    3. Mira la sección 'Realtime' del panel Umami"
  echo ""
  echo "  Si quieres, commitea el cambio:"
  echo "    git add index.html && git commit -m 'chore: setear UMAMI_WEBSITE_ID' && git push"
  echo ""
  exit 0
fi

# ── Modo: setup inicial completo ─────────────────────────────────────────
hr
step "Setup inicial Umami self-hosted"
hr

# 1) Detectar archivo .env con POSTGRES_PASSWORD ──────────────────────────
ENV_FILE=""
for candidate in .env server/.env; do
  if [[ -f "$candidate" ]] && grep -q "^POSTGRES_PASSWORD=" "$candidate"; then
    ENV_FILE="$candidate"
    break
  fi
done

if [[ -z "$ENV_FILE" ]]; then
  err "No encuentro POSTGRES_PASSWORD en .env ni en server/.env"
  err "Verifica tu configuración."
  exit 1
fi
ok "POSTGRES_PASSWORD encontrada en $ENV_FILE"

POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  err "POSTGRES_PASSWORD está vacío en $ENV_FILE"
  exit 1
fi

# 2) Generar UMAMI_APP_SECRET (idempotente) ───────────────────────────────
if grep -q "^UMAMI_APP_SECRET=" "$ENV_FILE"; then
  warn "UMAMI_APP_SECRET ya existía. Manteniendo el actual."
else
  step "Generando APP_SECRET aleatorio (128 chars hex)"
  SECRET=$(openssl rand -hex 64)
  {
    echo ""
    echo "# Umami analytics self-hosted (Fase A — generado $(date -u +%Y-%m-%dT%H:%M:%SZ))"
    echo "UMAMI_APP_SECRET=$SECRET"
  } >> "$ENV_FILE"
  ok "UMAMI_APP_SECRET agregado a $ENV_FILE"
fi

# 3) Construir UMAMI_DATABASE_URL (idempotente) ───────────────────────────
if grep -q "^UMAMI_DATABASE_URL=" "$ENV_FILE"; then
  warn "UMAMI_DATABASE_URL ya existía. Manteniendo el actual."
else
  echo "UMAMI_DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/umami" >> "$ENV_FILE"
  ok "UMAMI_DATABASE_URL agregado a $ENV_FILE"
fi

# 4) Crear database 'umami' en Postgres (idempotente) ─────────────────────
step "Verificando database 'umami' en Postgres"
if docker compose exec -T postgres psql -U postgres -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw 'umami'; then
  ok "Database 'umami' ya existía"
else
  info "Creando database 'umami'..."
  docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE umami;" > /dev/null
  ok "Database 'umami' creada"
fi

# 5) Verificar que docker-compose tiene el servicio umami ─────────────────
if ! grep -qE "^  umami:" docker-compose.yml; then
  err "El servicio 'umami' no está en docker-compose.yml"
  err "Asegúrate de haber hecho 'git pull origin main' antes."
  exit 1
fi

# 6) Levantar container Umami ─────────────────────────────────────────────
step "Levantando container Umami"
info "Primer arranque toma ~1-2 min (Umami corre migraciones automáticamente)"
docker compose up -d umami

# 7) Esperar healthcheck (timeout 3 min) ──────────────────────────────────
step "Esperando que Umami esté healthy"
MAX_WAIT=180
WAITED=0
INTERVAL=5
LAST_STATE=""

while [[ $WAITED -lt $MAX_WAIT ]]; do
  STATE=$(docker compose ps --format json umami 2>/dev/null \
    | awk -F'"Health":"' '/Health/{print $2}' \
    | awk -F'"' '{print $1}' \
    | head -1)
  STATE="${STATE:-starting}"

  if [[ "$STATE" != "$LAST_STATE" ]]; then
    info "Estado: $STATE (${WAITED}s)"
    LAST_STATE="$STATE"
  fi

  if [[ "$STATE" == "healthy" ]]; then
    ok "Umami healthy"
    break
  fi

  if [[ "$STATE" == "unhealthy" ]]; then
    err "Container marcó unhealthy. Revisa logs:"
    err "  docker compose logs --tail=80 umami"
    exit 1
  fi

  sleep $INTERVAL
  WAITED=$((WAITED + INTERVAL))
done

if [[ "$STATE" != "healthy" ]]; then
  err "Timeout esperando healthcheck (>${MAX_WAIT}s). Revisa logs:"
  err "  docker compose logs --tail=80 umami"
  exit 1
fi

# 8) Restart nginx para activar /stats ────────────────────────────────────
step "Reiniciando nginx para activar /stats"
docker compose up -d --no-deps nginx > /dev/null
ok "Nginx activo"

# 9) Smoke test endpoint público ──────────────────────────────────────────
step "Verificando endpoint público https://velumlaser.com/stats"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 10 https://velumlaser.com/stats 2>/dev/null || echo "000")
case "$HTTP_CODE" in
  200|302|307|308)
    ok "Endpoint /stats responde con HTTP $HTTP_CODE"
    ;;
  *)
    warn "Endpoint /stats respondió con HTTP $HTTP_CODE"
    warn "Si no es 200/302, revisa logs:"
    warn "  docker compose logs --tail=50 nginx umami"
    ;;
esac

# ── Cierre ───────────────────────────────────────────────────────────────
echo ""
hr
echo "${GREEN}${BOLD}  ✓ Setup automático completo${RESET}"
hr
echo ""
echo "${BOLD}Pasos manuales restantes (5 min en navegador):${RESET}"
echo ""
echo "  1) Abre ${BLUE}https://velumlaser.com/stats${RESET}"
echo ""
echo "  2) Login inicial:"
echo "       Usuario: ${BOLD}admin${RESET}"
echo "       Password: ${BOLD}umami${RESET}"
echo ""
echo "  3) ${YELLOW}Cambia el password inmediatamente:${RESET}"
echo "       Click en perfil (esquina superior derecha) → Profile → Change password"
echo ""
echo "  4) Registra el sitio:"
echo "       Settings → Websites → Add website"
echo "       Name:   ${BOLD}VELUM Laser${RESET}"
echo "       Domain: ${BOLD}velumlaser.com${RESET}"
echo ""
echo "  5) Copia el ${BOLD}Website ID${RESET} (UUID) que aparece tras guardar"
echo "     y corre:"
echo ""
echo "       ${BLUE}./deploy/setup-umami.sh --website-id <UUID>${RESET}"
echo ""
echo "  El script de arriba pega el ID en index.html, rebuilda nginx y deja"
echo "  el tracking activo. Después solo verifica abriendo el sitio."
echo ""
