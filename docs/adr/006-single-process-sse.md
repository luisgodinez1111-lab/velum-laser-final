# ADR 006 — Proceso único de Node.js para SSE (sin cluster ni Redis pub/sub)

**Estado:** Aceptado
**Fecha:** 2026-03-30
**Área:** Arquitectura / Infraestructura

## Contexto

Las conexiones SSE del servidor se mantienen en un `Map` en memoria (`sseService.ts`). En un despliegue con múltiples procesos Node.js (cluster, PM2 cluster mode, múltiples réplicas Docker), un evento emitido en el proceso A no llega a conexiones SSE abiertas en el proceso B.

## Decisión

**El API corre como un único proceso Node.js dentro de un contenedor Docker.** No se usa cluster de Node.js ni múltiples réplicas del servicio `api`.

El `docker-compose.yml` despliega `api` con `deploy.replicas: 1` (implícito por defecto). Si se necesita alta disponibilidad en el futuro, el plan es escalar horizontalmente con un broker de eventos (Redis Streams o Postgres LISTEN/NOTIFY) para distribuir los broadcasts SSE.

## Consecuencias

**Positivas:**
- El `Map` en memoria es suficiente; no se requiere infraestructura adicional.
- Arquitectura simple: menos moving parts, más fácil de operar y depurar.
- Los límites de memoria del contenedor (actualmente 512 MB) son el techo de escalado vertical; suficiente para la carga actual de una clínica single-tenant.

**Negativas:**
- Si el proceso cae, todas las conexiones SSE activas se cortan. El cliente `EventSource` reconecta automáticamente, pero hay una interrupción breve.
- No escala horizontalmente sin refactorizar `sseService.ts` para usar un broker externo.

## Deuda técnica conocida

Si el tráfico crece y se requieren múltiples réplicas, la migración consiste en:
1. Añadir Redis a `docker-compose.yml`.
2. Reemplazar el `Map` local en `sseService.ts` con un subscriber Redis por proceso.
3. `broadcastToUser` publica en Redis; cada proceso hace `res.write` solo a sus conexiones locales.

## Métricas de supervisión

- `GET /api/v1/health/detailed` expone `checks.sse.connections` con el número de conexiones SSE activas.
- El límite de 3 conexiones por usuario (`MAX_SSE_PER_USER`) previene el agotamiento de memoria/file-descriptors en condiciones normales.
