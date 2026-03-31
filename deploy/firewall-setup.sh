#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Velum Laser — Configuración de firewall (UFW)
#
# REGLAS REQUERIDAS en producción:
#
#   Puerto 22  (SSH)    → permitir desde IPs de gestión (reemplazar YOUR_IP)
#   Puerto 80  (HTTP)   → permitir desde todos (nginx redirige a HTTPS)
#   Puerto 443 (HTTPS)  → permitir desde todos
#   Puerto 4000 (API)   → NO expuesto al host (solo red Docker interna)
#   Puerto 5432 (Postgres) → solo 127.0.0.1 (bind en docker-compose)
#   Todo lo demás       → denegar
#
# Uso:
#   sudo bash deploy/firewall-setup.sh [--apply]
#   Sin --apply: solo muestra las reglas a aplicar (modo dry-run)
#   Con --apply: configura UFW (requiere sudo)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APPLY=false
if [ "${1:-}" = "--apply" ]; then
  APPLY=true
fi

# ── Reemplaza con la IP real del equipo de administración ─────────────────────
ADMIN_IP="${ADMIN_IP:-YOUR_ADMIN_IP/32}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Velum Laser — Reglas de Firewall (UFW)"
echo "  Servidor: $(hostname)"
echo "  Modo: $([ "$APPLY" = true ] && echo 'APLICAR' || echo 'DRY-RUN (solo mostrar)')"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Reglas a configurar:"
echo "  ufw default deny incoming"
echo "  ufw default allow outgoing"
echo "  ufw allow from ${ADMIN_IP} to any port 22 proto tcp   # SSH — solo desde IP de gestión"
echo "  ufw allow 80/tcp                                        # HTTP (redirect a HTTPS)"
echo "  ufw allow 443/tcp                                       # HTTPS"
echo "  # Puerto 4000: NO se expone (solo red Docker interna — ver docker-compose.yml)"
echo "  # Puerto 5432: bind 127.0.0.1 en docker-compose — no requiere regla UFW adicional"
echo ""

if [ "$APPLY" = false ]; then
  echo "Para aplicar: ADMIN_IP=<tu_ip> sudo bash deploy/firewall-setup.sh --apply"
  echo ""
  exit 0
fi

# ── Verificaciones antes de aplicar ─────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "[ERROR] Este script requiere sudo."
  exit 1
fi

if [ "$ADMIN_IP" = "YOUR_ADMIN_IP/32" ]; then
  echo "[ERROR] Define ADMIN_IP antes de aplicar las reglas."
  echo "  Ejemplo: ADMIN_IP=203.0.113.42/32 sudo bash deploy/firewall-setup.sh --apply"
  exit 1
fi

if ! command -v ufw &>/dev/null; then
  echo "[ERROR] UFW no está instalado. Instalar: apt install ufw"
  exit 1
fi

# ── Aplicar reglas ────────────────────────────────────────────────────────────
ufw --force reset

ufw default deny incoming
ufw default allow outgoing

ufw allow from "${ADMIN_IP}" to any port 22 proto tcp
ufw allow 80/tcp
ufw allow 443/tcp

ufw --force enable

echo ""
ufw status verbose
echo ""
echo "[firewall] Reglas aplicadas correctamente — $(date -Is)"
