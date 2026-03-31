# ADR 002 — Protección contra fuerza bruta con estrategia dual (memoria + DB)

**Estado:** Aceptado
**Fecha:** 2026-03-30
**Área:** Seguridad / Auth

## Contexto

El endpoint de login es el objetivo más frecuente de ataques de fuerza bruta. Se requiere un mecanismo de lockout que:
1. Sea rápido (no añada latencia apreciable al caso normal).
2. Sobreviva reinicios del servidor (persistente).
3. Sea testeable de forma aislada.

## Decisión

**`loginSecurityService` implementa una estrategia dual:**

1. **Fast-path en memoria** (`Map<email, expiresAt>`): primera línea de defensa. Si el email está bloqueado en memoria, el check tarda ~0 ms sin tocar la DB.
2. **DB como source of truth** (`user.loginLockedUntil`): si no hay entrada en memoria, se consulta la DB. Permite que el lockout persista entre reinicios del proceso Node.js.

El estado en memoria se sincroniza con la DB en el momento en que se activa un lockout.

## Consecuencias

**Positivas:**
- Requests sucesivos de un atacante bloqueado no generan queries a la DB.
- El lockout sobrevive a `pm2 restart` / reinicio del contenedor Docker.
- El módulo es completamente testeable sin DB real (ver `_forceLoginLockout`).

**Negativas:**
- En despliegues multi-proceso (cluster, múltiples réplicas) el mapa en memoria no se comparte entre instancias. El fast-path sería efectivo por proceso, no globalmente. En el diseño actual (single-process en Docker), esto no es un problema.
- Si el proceso cae justo después de actualizar la DB pero antes de sincronizar el mapa, el fast-path no reflejaría el lockout hasta la próxima consulta a DB — aceptable dado que la DB actúa como fallback.

## Parámetros configurados

| Parámetro | Valor | Justificación |
|---|---|---|
| `LOGIN_MAX_FAILURES` | 10 | Permite ~2 errores de tipeo por contraseña sin bloquear al usuario legítimo |
| `LOGIN_LOCKOUT_MS` | 15 min | Disuasorio para ataques automatizados; no excesivo para usuarios legítimos |

## Alternativas descartadas

| Alternativa | Razón de descarte |
|---|---|
| Solo DB | Cada intento de login fallido golpea la DB → mayor latencia y carga |
| Solo memoria | No persiste entre reinicios; vulnerable a exploits de reinicio del proceso |
| Redis | Añadiría una dependencia de infraestructura no justificada para una instalación single-tenant |
