# Pruebas mínimas y checklist (VELUM)

## Tests automatizados
```bash
cd server
npm test
```

Incluye:
- Auth utils
- RBAC middleware
- Stripe webhook signature

## Checklist smoke test (producción)
1) Registro de usuario
2) Login exitoso
3) Stripe Checkout (modo test) → pago exitoso
4) Acceso al portal de miembro
5) Cancelación desde Customer Portal
6) Webhook `invoice.payment_failed` → estado `past_due`
7) Verificar bloqueo por pago fallido tras `GRACE_PERIOD_DAYS`
8) Subida de documentos
9) Firma de documentos
10) Descarga de documentos (solo dueño o staff/admin)
11) Acceso a panel admin (staff/admin)
12) Export CSV desde `/admin/reports?format=csv`
