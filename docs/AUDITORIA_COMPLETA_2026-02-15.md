# Auditoría técnica completa (VELUM)

**Fecha:** 2026-02-15  
**Alcance:** Frontend (React + Vite), API (Express + Prisma), infraestructura (Docker/Nginx), calidad de build y postura de seguridad.

## Resumen ejecutivo

Se realizó una revisión integral del repositorio y se identificaron **5 hallazgos prioritarios**:

1. **P1 - Exposición de tokens sensibles en respuestas de autenticación** (`verificationToken` y `resetToken` devueltos al cliente).  
2. **P1 - Control de acceso incompleto en descarga de archivos** (cualquier usuario autenticado podría descargar por ID).  
3. **P1 - El frontend no compila** por error sintáctico en `StaffDashboard.tsx`.  
4. **P2 - Configuración de build TypeScript del backend inconsistente** (`rootDir: src` + `include: tests`).  
5. **P2 - Hardening incompleto en despliegue** (Nginx sin headers de seguridad explícitos y Postgres publicado con credenciales triviales en compose).

---

## Metodología

- Revisión estática de código (rutas, controladores, servicios, configuración de build y despliegue).
- Ejecución de checks de compilación para frontend y backend.
- Evaluación de riesgos de seguridad por exposición de datos, autenticación/autorización y superficie de despliegue.

---

## Hallazgos detallados

## 1) [P1] Exposición de tokens de verificación y recuperación

**Severidad:** Alta  
**Impacto:** Si un cliente o actor malicioso intercepta respuestas o logs del frontend, podría usar `verificationToken`/`resetToken` para tomar control de flujos sensibles.

### Evidencia
- `register` responde `verificationToken` en JSON.
- `forgotPassword` responde `resetToken` en JSON.

### Recomendación
- No devolver tokens sensibles al cliente en entornos productivos.
- Mover el envío de tokens a canal seguro (correo/transaccional) y retornar respuesta genérica.
- Si es necesario para QA, habilitar solo por flag de entorno no productivo.

---

## 2) [P1] Descarga de archivos sin verificación de ownership/rol

**Severidad:** Alta  
**Impacto:** Exfiltración de documentos privados por enumeración o filtración de IDs.

### Evidencia
- `downloadFile` obtiene archivo por ID y lo sirve sin comprobar que el solicitante sea dueño o staff/admin.
- En `deleteFile` sí existe verificación de ownership/rol, mostrando inconsistencia.

### Recomendación
- Repetir la misma política de autorización en `downloadFile`:
  - permitir si `file.userId === req.user.id` o rol en `staff/admin`.
- Opcional: migrar a IDs no predecibles firmados o URLs temporales.

---

## 3) [P1] Build del frontend roto por error de sintaxis

**Severidad:** Alta (calidad/entrega)  
**Impacto:** El artefacto de producción no se puede generar.

### Evidencia
- `vite build` falla en `pages/StaffDashboard.tsx` con error `Expected "}" but found ":"`.

### Recomendación
- Corregir la estructura JSX (ternarios/llaves) en la sección alrededor de la línea reportada.
- Añadir check obligatorio de CI: `npm run build` en PR.

---

## 4) [P2] Configuración TypeScript del backend inconsistente

**Severidad:** Media  
**Impacto:** Build frágil; errores de compilación al incluir tests fuera de `rootDir`.

### Evidencia
- `tsconfig.json` define `rootDir: "src"` pero incluye `"tests"`.

### Recomendación
- Opción A: separar tsconfig de build y tsconfig de tests.
- Opción B: ampliar `rootDir` a `.` y mover salida con `outDir` adecuado.
- Agregar pipeline con `npm --prefix server run build` y `npm --prefix server test`.

---

## 5) [P2] Hardening de infraestructura incompleto

**Severidad:** Media  
**Impacto:** Mayor superficie de ataque y menor resiliencia operativa.

### Evidencia
- Nginx sin headers de seguridad explícitos (`HSTS`, `X-Content-Type-Options`, etc.).
- Compose expone Postgres en `5432` y usa credenciales por defecto `postgres/postgres`.

### Recomendación
- En Nginx: añadir headers y políticas TLS estrictas en entorno productivo.
- En compose de producción: evitar publicar `5432` salvo necesidad, usar secretos robustos y segmentación de red.
- Activar rotación de secretos y backup/restore probado.

---

## Fortalezas observadas

- Uso de `helmet`, `cors` con credentials y cookies `httpOnly` en auth.
- Verificación de firma + idempotencia en webhooks de Stripe.
- Esquemas de validación (`zod`) en múltiples flujos.
- Logging/auditoría transaccional en acciones relevantes.

---

## Plan de remediación propuesto (priorizado)

### 48 horas
1. Corregir build frontend en `StaffDashboard.tsx`.
2. Corregir autorización en `downloadFile`.
3. Eliminar devolución de tokens sensibles en responses públicas.

### 7 días
4. Reestructurar configuración TS backend (build/test).
5. Endurecer Nginx y compose para producción (headers + secretos + puertos).

### 30 días
6. CI/CD con gates obligatorios: build frontend, build backend, tests backend, lint.
7. Auditoría de dependencias y escaneo SAST/secret scanning automatizados.

---

## Resultado global

**Estado actual:** funcionalidad amplia, pero con brechas de seguridad/autorización y de confiabilidad de build que deben resolverse antes de un release productivo estricto.  
**Riesgo agregado:** **Medio-Alto** hasta completar las remediaciones P1.
