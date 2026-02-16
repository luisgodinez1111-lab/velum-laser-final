# Pruebas mínimas y checklist (VELUM)

## Tests automatizados
```bash
cd server
npm test
npm run build
```

Incluye:
- Auth utils
- RBAC middleware (incluye rol `system`)
- Stripe webhook signature
- Contrato de compatibilidad `/me` vs `/users/me`

## Checklist smoke test (staging/prod)
1. Registro de usuario
2. Login exitoso
3. `GET /api/me` y `GET /api/users/me` devuelven el mismo usuario
4. Crear lead en `/api/v1/leads` con UTM + `fbp/fbc`
5. Obtener y guardar expediente en `/api/v1/medical-intakes/me`
6. Aprobar expediente como staff/admin/system
7. Crear cita en `/api/v1/appointments`
8. Reprogramar y cancelar cita (`PATCH /api/v1/appointments/{id}`)
9. Stripe Checkout (modo test) -> pago exitoso
10. Webhook `invoice.payment_failed` -> estado `past_due` y `Payment.failed`
11. Historial de pagos en `/api/v1/payments/me`
12. Registrar sesión clínica (`POST /api/v1/sessions`) y feedback (`PATCH /api/v1/sessions/{id}/feedback`)
13. Verificar audit logs con filtros en `/api/v1/audit-logs`
14. Verificar endpoint de monitoreo de marketing `/api/v1/marketing/events`
