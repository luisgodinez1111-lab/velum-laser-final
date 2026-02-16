# Runbook de release/rollback (VELUM API v1)

## Checklist pre-release
1. Confirmar backup lógico de base de datos y carpeta de uploads.
2. Verificar variables de entorno nuevas:
   - `META_ENABLED`, `META_API_VERSION`, `META_PIXEL_ID`, `META_ACCESS_TOKEN`
   - `APPOINTMENT_RESCHEDULE_MIN_HOURS`
3. Ejecutar pruebas locales:
   - `cd server && npm test`
   - `cd server && npm run build`
4. Verificar OpenAPI:
   - `http://localhost:4000/docs`

## Release
1. Hacer deploy del contenedor API.
2. Ejecutar migraciones:
   - `cd server && npm run prisma:migrate`
3. (Opcional) seed inicial:
   - `RUN_SEED=true`
4. Ejecutar smoke test crítico:
   - Auth (`/auth/register`, `/auth/login`, `/me`, `/users/me`)
   - Legacy (`/membership/*`, `/documents/*`, `/admin/*`)
   - v1 (`/api/v1/leads`, `/api/v1/medical-intakes/me`, `/api/v1/appointments`, `/api/v1/payments/me`)

## Rollback
1. Detener tráfico al API nuevo (rollback de imagen o tag anterior).
2. Restaurar backup DB si hubo corrupción de datos.
3. Restaurar `/var/velum/uploads` si hubo pérdida de adjuntos.
4. Re-ejecutar smoke de legacy para confirmar estabilidad.

## Incidentes frecuentes
1. Error en Meta CAPI:
   - Revisar `META_ENABLED`, `META_PIXEL_ID`, `META_ACCESS_TOKEN`.
   - Consultar `/api/v1/marketing/events` para ver `metaStatus` y `metaError`.
2. Citas rechazadas por reglas:
   - Verificar `medicalIntake.status` en `submitted|approved` y membresía `active`.
3. Webhook Stripe idempotente:
   - Revisar tabla `WebhookEvent` para `stripeEventId` duplicado.
