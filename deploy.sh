#!/usr/bin/env bash
set -euo pipefail

echo "→ Construyendo imagen nginx con el nuevo frontend..."
docker compose build nginx

echo "→ Reiniciando nginx (sin tocar api ni postgres)..."
docker compose up -d --no-deps nginx

echo "✓ Deploy completo"
