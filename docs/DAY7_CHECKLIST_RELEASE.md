# Day 7 - Checklist de Release (VELUM)

## Pre-deploy
- [ ] Backup DB generado
- [ ] `prisma migrate deploy` sin errores
- [ ] API build/restart correcto
- [ ] `/health` y `/api/health` en 200

## Smoke mínimo
- [ ] `POST /api/v1/leads` => 201
- [ ] `POST /auth/login` => 200
- [ ] `GET /users/me` => 200
- [ ] `GET /api/v1/payments/me` => 200
- [ ] `GET /api/v1/audit-logs` admin => 200
- [ ] `GET /api/v1/audit-logs` no autorizado => 401/403
- [ ] `POST /stripe/webhook` inválido => 400

## RBAC crítico
- [ ] staff no puede cambiar rol de usuario
- [ ] admin/system sí puede cambiar rol
- [ ] `user.role.update` queda en AuditLog
