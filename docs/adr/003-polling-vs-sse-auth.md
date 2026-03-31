# ADR 003 — SSE para notificaciones en tiempo real (vs. polling o WebSockets)

**Estado:** Aceptado
**Fecha:** 2026-03-30
**Área:** Notificaciones / Tiempo real

## Contexto

El panel admin y el portal del paciente requieren notificaciones push: cuando se crea un cargo, se aprueba un expediente, etc. Las opciones evaluadas fueron polling HTTP, SSE y WebSockets.

## Decisión

**Server-Sent Events (SSE) unidireccionales (servidor → cliente).**

El cliente abre una conexión con `EventSource` al endpoint `/api/v1/notifications/stream`. El servidor mantiene la respuesta abierta y emite eventos cuando ocurre algo relevante para ese usuario.

## Arquitectura

- `sseService.ts` mantiene un `Map<userId, Set<Response>>` con las conexiones activas.
- Límite de **3 conexiones SSE por usuario** (`MAX_SSE_PER_USER`) para prevenir resource exhaustion.
- Timeout automático de **4 horas** (`SSE_MAX_SESSION_MS`); el cliente debe reconectar.
- `broadcastToUser(userId, event)` itera las conexiones activas del usuario y hace `res.write(...)`.
- Los handlers de dominio (`onCustomChargeCreated`, etc.) persisten la notificación en DB y luego llaman a `broadcastToUser`.

## Consecuencias

**Positivas:**
- Protocolo simple sobre HTTP/1.1; funciona a través de nginx sin configuración adicional.
- Reconexión automática del navegador (`EventSource` tiene reconexión incorporada).
- Unidireccional: el cliente no necesita enviar datos por el canal SSE.
- Sin dependencias adicionales (no hay socket.io, no hay Redis pub/sub).

**Negativas:**
- Unidireccional: si se requiriera comunicación bidireccional en el futuro, habría que migrar a WebSockets.
- En multi-proceso (cluster de Node.js), `broadcastToUser` solo alcanza conexiones del mismo proceso. Actualmente no es un problema (single-process).
- Cada conexión SSE mantiene un socket TCP abierto; el límite por usuario mitiga el agotamiento de file descriptors.

## Alternativas descartadas

| Alternativa | Razón de descarte |
|---|---|
| Polling HTTP | Introduce latencia perceptible y carga innecesaria en la DB por queries periódicas aunque no haya eventos |
| WebSockets | Bidireccional innecesario para este caso; más complejo de gestionar con cookies httpOnly y nginx |
| Long polling | Más complejo que SSE sin ventajas claras |
