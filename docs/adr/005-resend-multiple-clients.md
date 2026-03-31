# ADR 005 — Clientes Resend dedicados por propósito (6 API keys separadas)

**Estado:** Aceptado
**Fecha:** 2026-03-30
**Área:** Email / Integraciones

## Contexto

La plataforma envía emails en 6 contextos diferentes: verificación de email, reset de contraseña, recordatorios/OTPs, documentos firmados, invitaciones admin/paciente y notificaciones in-app. Cada contexto tiene dominios remitentes, límites de rate y requisitos de entregabilidad distintos.

## Decisión

**Se usa una API key de Resend por propósito**, cada una configurada como variable de entorno independiente:

| Variable | Propósito |
|---|---|
| `RESEND_KEY_VERIFICATION` | Verificación de email al registrarse |
| `RESEND_KEY_RESET` | Reset de contraseña |
| `RESEND_KEY_REMINDERS` | Recordatorios de citas y OTPs de WhatsApp backup |
| `RESEND_KEY_DOCUMENTS` | Documentos firmados |
| `RESEND_KEY_ADMIN_INVITE` | Invitaciones de admin y nuevos pacientes |
| `RESEND_KEY_NOTIFICATIONS` | Notificaciones in-app vía email |

El `emailService.ts` instancia un cliente Resend diferente para cada key y expone funciones tipadas por propósito (`sendVerificationEmail`, `sendPasswordResetEmail`, etc.).

## Consecuencias

**Positivas:**
- Aislamiento de cuotas: un spike en notificaciones no consume el límite de los emails de reset de contraseña (críticos para el usuario).
- Trazabilidad en el dashboard de Resend: cada key tiene sus propias métricas de entregabilidad.
- Revocación quirúrgica: si una key se compromete, solo ese tipo de email se ve afectado.
- Remitentes distintos por propósito (`hola@`, `noreply@`, `docs@`) sin conflictos de reputación de dominio.

**Negativas:**
- 6 variables de entorno más a gestionar en el servidor y en los secretos de CI/CD.
- Si Resend introduce cambios de API, hay que actualizar la lógica de inicialización en 6 lugares (mitigado por el factory pattern en `emailService.ts`).

## Alternativas descartadas

| Alternativa | Razón de descarte |
|---|---|
| Una sola key global | Un spike de notificaciones puede bloquear emails de reset de contraseña |
| Sendgrid / AWS SES | Mayor complejidad de configuración; Resend tiene mejor DX para TypeScript |
