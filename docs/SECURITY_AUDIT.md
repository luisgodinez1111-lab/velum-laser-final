# Auditoría de seguridad (VELUM)

Fecha: 2025-01-01

## Resumen ejecutivo
El repositorio ya incluye backend Node.js + TypeScript con Prisma/PostgreSQL, autenticación JWT en cookies, Stripe Checkout + Customer Portal y webhooks con verificación de firma e idempotencia. Se añadieron controles de acceso por roles, validación de entradas y logging. Se detectan áreas de mejora operativa (hardening de Nginx, rotación de secrets, observabilidad y backups automatizados). No se encontraron secretos reales en el repo; los únicos valores sensibles son placeholders en `.env.example`. 

## Hallazgos

### Critical
1) **No se detectaron fallas críticas activas.**
- **Impacto:** N/A
- **Corrección:** mantener el flujo de despliegue y variables de entorno en producción.

### High
2) **Hardening de Nginx/SSL pendiente**
- **Impacto:** configuración TLS por defecto sin HSTS ni headers de seguridad avanzados podría degradar postura de seguridad.
- **Corrección:** añadir `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` y ciphers recomendados.

3) **Rotación de secrets y llaves Stripe**
- **Impacto:** uso prolongado de llaves aumenta riesgo en caso de filtración.
- **Corrección:** rotar llaves de Stripe y JWT al menos trimestralmente y registrar rotaciones.

### Medium
4) **Rate limit solo en rutas /auth**
- **Impacto:** otros endpoints (documentos, administración) podrían ser objetivo de abuso.
- **Corrección:** aplicar rate limiting global con límites más altos y reglas específicas por ruta.

5) **Uploads en VPS**
- **Impacto:** riesgo de saturación de disco si no se controla el tamaño total.
- **Corrección:** monitorear almacenamiento, activar cuotas y limpieza de archivos antiguos.

### Low
6) **Observabilidad limitada**
- **Impacto:** menor visibilidad ante incidentes y auditorías.
- **Corrección:** centralizar logs (p. ej., Loki/ELK) y métricas.

## Validación de secretos
- Se revisó el repo buscando patrones `sk_`, `whsec_`, `password=`, tokens y llaves. Solo se encontraron valores de prueba en tests y placeholders en `.env.example`.
