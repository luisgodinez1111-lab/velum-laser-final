# Runbook Rollback y Operación (VELUM)

## Rollback API
1. `git checkout <commit_estable>`
2. `docker compose up -d --build api`
3. Validar `/health` y smoke auth básico

## Rollback DB
1. Restaurar backup:
   - `psql -U postgres -d velum < backup.sql`
2. Levantar API
3. Repetir smoke completo

## Incidentes comunes
- `401` inesperado: revisar cookie/token y orden de rutas en `src/index.ts`
- Prisma schema mismatch: validar columnas y aplicar corrección controlada
- `connection reset` tras deploy: esperar warmup y revisar logs API
- Stripe webhook inválido: revisar firma y `STRIPE_WEBHOOK_SECRET`

## Operación diaria
- Healthcheck de API
- Revisión de auditoría (`/api/v1/audit-logs`)
- Revisión de pagos/membresías
- Verificación de logs de errores
