# Auditoría de seguridad (VELUM)

Fecha: 2025-01-01

## Resumen ejecutivo
El repositorio contiene únicamente frontend (Vite + React) sin backend ni controles de autenticación/roles en producción. No existe validación de entrada en el servidor, ni integración de Stripe, ni control de acceso a documentos. Para producción se requiere backend seguro, gestión de identidades, almacenamiento privado y webhooks verificados.

## Hallazgos

### Critical
1) **No existe backend para auth/pagos/documentos**
- **Impacto:** cualquier usuario puede acceder al frontend sin restricciones; no hay control de acceso ni verificación de pagos.
- **Reproducción:** abrir la app sin iniciar sesión; no hay endpoints de autenticación ni validación.
- **Corrección:** implementar backend con auth, RBAC, Stripe y storage privado.

### High
2) **Sin verificación de pagos ni webhooks**
- **Impacto:** no hay fuente de verdad para la suscripción. Permite acceso sin pago.
- **Corrección:** integrar Stripe Checkout + Customer Portal + Webhooks con verificación de firma e idempotencia.

3) **Documentos sin almacenamiento privado**
- **Impacto:** no existe almacenamiento de documentos; riesgo de exfiltración si se implementa en frontend.
- **Corrección:** usar S3 compatible con URLs firmadas y expiración.

### Medium
4) **Sin controles de sesión ni cookies httpOnly**
- **Impacto:** si se implementa auth en frontend, tokens quedarían expuestos a XSS.
- **Corrección:** JWT en cookie httpOnly + SameSite + Secure.

5) **Sin validación de entrada en servidor**
- **Impacto:** riesgo de inyección/abuso una vez haya backend.
- **Corrección:** validar inputs con Zod/Joi, límites de tamaño y tipos.

### Low
6) **Sin logging estructurado ni auditoría**
- **Impacto:** baja visibilidad ante incidentes.
- **Corrección:** agregar logging estructurado y audit logs.

## Dependencias
El frontend no declara herramientas de seguridad/linting ni locks. Se recomienda:
- Mantener `react`, `react-router-dom`, `vite` actualizados.
- Añadir scripts de lint/format y análisis de dependencias.
