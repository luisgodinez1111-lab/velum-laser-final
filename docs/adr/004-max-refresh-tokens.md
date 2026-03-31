# ADR 004 — Límite máximo de refresh tokens por usuario

**Estado:** Aceptado
**Fecha:** 2026-03-30
**Área:** Seguridad / Auth

## Contexto

El sistema emite refresh tokens de larga duración que se persisten en la tabla `RefreshToken`. Sin un límite, un usuario que inicie sesión desde muchos dispositivos o que sufra fugas de tokens podría acumular un número ilimitado de tokens activos en DB.

## Decisión

**Se mantiene un máximo de tokens de refresco activos por usuario.** Al emitir un nuevo refresh token, si el usuario ya tiene el máximo configurado, se eliminan los más antiguos (estrategia LRU).

El hash del token (SHA-256) es lo que se almacena, nunca el token en claro.

## Consecuencias

**Positivas:**
- Previene el crecimiento ilimitado de la tabla `RefreshToken`.
- Limitar el número de tokens activos reduce el impacto de un compromiso de un token viejo: el atacante no puede acumular tokens indefinidamente.
- Facilita el logout global (`DELETE /api/v1/auth/logout-all`): eliminar todas las filas del usuario revoca todas las sesiones.

**Negativas:**
- Un usuario con muchos dispositivos podría verse deslogueado del más antiguo al iniciar sesión en un dispositivo nuevo. Es un trade-off aceptable para una clínica (no un servicio masivo).

## Parámetros

| Parámetro | Valor actual |
|---|---|
| Máximo de refresh tokens activos por usuario | Configurable en `authService.ts` |
| Algoritmo de rotación | Eliminación del token más antiguo por `createdAt` |
| Hash del token | SHA-256, almacenado en `RefreshToken.tokenHash` |

## Alternativas descartadas

| Alternativa | Razón de descarte |
|---|---|
| Sin límite | Crecimiento ilimitado de la tabla; surface de ataque mayor |
| Un único token (revocar todos al emitir uno nuevo) | Desloguea todos los dispositivos en cada login; UX inaceptable |
