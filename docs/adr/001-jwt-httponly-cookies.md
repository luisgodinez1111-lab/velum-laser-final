# ADR 001 — JWT en cookies httpOnly (no localStorage)

**Estado:** Aceptado
**Fecha:** 2026-03-30
**Área:** Seguridad / Auth

## Contexto

La aplicación necesita autenticar a usuarios en una SPA React con un backend Express. Las opciones comunes son:
- Guardar el JWT en `localStorage` o `sessionStorage`
- Guardar el JWT en una cookie con atributo `httpOnly`

## Decisión

**El JWT de acceso se almacena exclusivamente en una cookie `httpOnly`.**
El refresh token también se persiste como cookie `httpOnly` con mayor TTL.

## Consecuencias

**Positivas:**
- Inaccessible a JavaScript del cliente → inmune a XSS (la vulnerabilidad más frecuente en SPAs).
- El navegador envía la cookie automáticamente en cada request al mismo origen.
- Compatible con las CSP más restrictivas.

**Negativas:**
- Requiere protección CSRF para mutaciones (mitigado con `SameSite=Lax` + verificación de `Origin` en el middleware).
- El logout requiere invalidar el refresh token en DB; no basta con eliminar la cookie del cliente.

## Alternativas descartadas

| Alternativa | Razón de descarte |
|---|---|
| `localStorage` | Vulnerable a XSS — cualquier script inyectado puede robar el token |
| `sessionStorage` | Mismo problema que `localStorage` |
| Header `Authorization` con token en memoria | Requiere lógica compleja de re-hidratación tras recarga; pérdida de sesión en F5 |

## Referencias

- OWASP: [HTML5 Security — LocalStorage](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- RFC 6265bis: Cookie attributes
