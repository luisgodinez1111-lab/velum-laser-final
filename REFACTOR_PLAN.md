# Plan de Refactoring — VELUM OS
> Objetivo: pasar de 7.9/10 → 9.5/10
> Sistema en producción activa — cada fase es deployable de forma independiente.
> Actualizar este archivo marcando [x] al completar cada tarea.

---

## Estado actual

| Fase | Estado | Score impacto |
|------|--------|---------------|
| Fase 1 — Quick wins (sesión anterior) | ✅ Completada | +0.7 |
| Fase 2 — Split agendaService | ✅ Completada | +0.4 |
| Fase 3 — Split adminController + CSV | ✅ Completada | +0.3 |
| Fase 4 — Types frontend (eliminar `any`) | ✅ Completada | +0.3 |
| Fase 5 — Split notificationService | ✅ Completada | +0.2 |
| Fase 6 — Tests nuevos services | 🔲 Pendiente | +0.3 |
| Fase 7 — GDPR + compliance | 🔲 Pendiente | +0.2 |
| Fase 8 — Observabilidad y ADRs | 🔲 Pendiente | +0.1 |

---

## Reglas del plan

1. Cada fase termina con `npm test` en verde (186+ tests passing)
2. `tsc --noEmit` limpio antes de cada commit
3. No tocar migraciones ya aplicadas en producción
4. Sin cambios en contratos de API (respuestas JSON) — el frontend no debe romperse
5. Un commit por fase — mensaje descriptivo en español

---

## FASE 2 — Dividir agendaService.ts
**Prioridad: CRÍTICA** | Esfuerzo: ~3h | Riesgo: Medio

### Contexto
`agendaService.ts` tiene 1,268 líneas con 8 responsabilidades distintas.
Es el archivo más difícil de mantener y testear del backend.

### Estrategia de división sin romper imports
El archivo original se convierte en **barrel** que re-exporta todo.
Los 8+ archivos que actualmente importan de `agendaService` no requieren cambios.

### Archivos a crear

#### `server/src/services/agendaTimezoneUtils.ts`
Funciones puras de cálculo temporal — sin acceso a DB, testeables en aislamiento.
```
Extraer:
  - toZonedParts()           (línea 24-53)
  - dayOfWeekForDateKey()    (línea 55-58)
  - overlapsRange()          (línea 60)
  - appointmentRangeForDateKey() (línea 62-89)
  - normalizeDateKey()       (línea 91)
  - bufferedRange()          (línea 635-651)

Exportar todo — serán usadas desde otros services.
```

#### `server/src/services/agendaConflictService.ts`
Lógica de detección de conflictos — sin side effects, pura validación.
```
Extraer:
  - isBlockOverlapping()     (línea 615-633)
  - hasCabinConflict()       (línea 652-732)
  - AgendaValidationError    (línea 725 — mover aquí, re-exportar desde barrel)
```

#### `server/src/services/agendaAvailabilityService.ts`
Cálculo de slots disponibles — la lógica más compleja del sistema.
```
Extraer:
  - getEffectiveRule()       (línea 561-613)
  - buildAgendaSlots()       (línea 929-1034)
  - resolveAppointmentPlacement() (línea 734-872)
  - cabinProductivityReport() (línea 1035-1112)
  - getMemberAvailableSlots() (exportado actualmente desde getAgendaDaySnapshot)

Dependencias: importará de agendaTimezoneUtils + agendaConflictService
```

#### `server/src/services/agendaSyncService.ts`
Ciclo de vida de citas — auto-confirmación y marcado de no-show.
```
Extraer:
  - syncAppointmentWorkflow() (línea 873-928)
  - Dependencias: importará de agendaTimezoneUtils
```

#### `server/src/services/agendaSetupService.ts`
Inicialización de defaults en BD — solo se llama al arrancar.
```
Extraer:
  - ensurePolicy()           (línea 162-172)
  - ensureCabins()           (línea 173-186)
  - ensureWeeklyRules()      (línea 187-205)
  - ensureTreatments()       (línea 206-216)
  - ensureAgendaDefaults()   (línea 217-251) ← export raíz
```

#### `server/src/services/agendaService.ts` (reducido a barrel)
```typescript
// agendaService.ts — barrel de re-exports (backward compat)
export * from "./agendaTimezoneUtils";
export * from "./agendaConflictService";
export * from "./agendaAvailabilityService";
export * from "./agendaSyncService";
export * from "./agendaSetupService";
export { getAgendaConfig, updateAgendaConfig } from "./agendaConfigService";
export { createAgendaBlock, deleteAgendaBlock } from "./agendaBlockService";
export { getAgendaDaySnapshot, getAgendaDailyReport } from "./agendaReportService";
```

#### `server/src/services/agendaConfigService.ts`
```
Extraer:
  - getAgendaConfig()        (línea 252-281)
  - updateAgendaConfig()     (línea 282-560)  ← 278 líneas sola — transacción grande

Dependencias: prisma únicamente
```

#### `server/src/services/agendaBlockService.ts`
```
Extraer:
  - createAgendaBlock()      (línea 1219-1254)
  - deleteAgendaBlock()      (línea 1255-1264)

Dependencias: agendaConflictService + prisma
```

#### `server/src/services/agendaReportService.ts`
```
Extraer:
  - getAgendaDaySnapshot()   (línea 1113-1218)
  - getAgendaDailyReport()   (línea 1265-1268)

Dependencias: agendaAvailabilityService + agendaTimezoneUtils + prisma
```

### Tareas
- [ ] Crear `agendaTimezoneUtils.ts` con funciones puras
- [ ] Crear `agendaConflictService.ts` + mover AgendaValidationError
- [ ] Crear `agendaConfigService.ts`
- [ ] Crear `agendaBlockService.ts`
- [ ] Crear `agendaSyncService.ts`
- [ ] Crear `agendaAvailabilityService.ts`
- [ ] Crear `agendaReportService.ts`
- [ ] Reducir `agendaService.ts` a barrel re-export
- [ ] Verificar que todos los imports existentes siguen funcionando
- [ ] `npm test` → verde
- [ ] `tsc --noEmit` → limpio

---

## FASE 3 — Dividir adminController.ts + extraer CSV service
**Prioridad: ALTA** | Esfuerzo: ~2h | Riesgo: Bajo-Medio

### Contexto
`adminController.ts` tiene 654 líneas combinando:
- Gestión de usuarios
- Gestión de membresías
- Generación de CSV con lógica inline
- Auditoría
- Expedientes médicos

Adicionalmente, accede a `prisma` directamente en lugar de usar services.

### Archivos a crear

#### `server/src/services/csvExportService.ts`
Extrae toda la lógica de generación CSV que está inline en handlers Express.
```
Responsabilidades:
  - Convertir rows de users/memberships a CSV con escape correcto
  - Streaming por lotes (cursor-based, BATCH=500)
  - Manejo de campos especiales (fechas, booleans, strings con comas)

Funciones:
  - streamUsersCSV(res, clinicId)
  - streamAuditLogsCSV(res, clinicId, filters)
  - escapeCsvField(value) — reusar el esc() de adminController:238

Nota: la función esc() de adminController es CSV escape (no HTML), no va a html.ts.
```

#### `server/src/controllers/userAdminController.ts`
```
Extraer de adminController:
  - listUsers()
  - getUserById()
  - updateUserRole()
  - createPatient()
  - exportUsers()           ← usa csvExportService

Líneas estimadas resultantes: ~280
```

#### `server/src/controllers/membershipAdminController.ts`
```
Extraer de adminController:
  - listMemberships()
  - updateMembershipStatus()
  - getMemberHistory()
  - adminActivateMembership()

Líneas estimadas resultantes: ~120
```

#### `server/src/controllers/intakeAdminController.ts`
```
Extraer de adminController:
  - adminUpdatePatientIntake()

Líneas estimadas resultantes: ~60
```

#### `server/src/controllers/auditAdminController.ts`
```
Extraer de adminController:
  - listAuditLogs()
  - exportAuditLogsCSV()    ← usa csvExportService
  - reports()               ← métricas generales del día

Líneas estimadas resultantes: ~120
```

### Actualizar rutas
`adminRoutes.ts` debe importar desde los 4 nuevos controllers.
El archivo de rutas en sí no cambia — solo los imports.

### Tareas
- [ ] Crear `csvExportService.ts` con lógica de streaming
- [ ] Crear `userAdminController.ts`
- [ ] Crear `membershipAdminController.ts`
- [ ] Crear `intakeAdminController.ts`
- [ ] Crear `auditAdminController.ts`
- [ ] Actualizar imports en `adminRoutes.ts`
- [ ] Eliminar `adminController.ts` (o dejarlo vacío con re-exports si hay imports directos)
- [ ] `npm test` → verde
- [ ] `tsc --noEmit` → limpio

---

## FASE 4 — Eliminar `any` en frontend
**Prioridad: ALTA** | Esfuerzo: ~1.5h | Riesgo: Bajo

### Contexto
Los servicios del frontend usan `any` en puntos de mapeo críticos.
Esto anula el beneficio de TypeScript en el frontend completo.

### Archivos afectados

#### `services/authService.ts`
```typescript
// ANTES (línea 14):
const mapUser = (user: any): AuthUser => { ... }

// DESPUÉS — definir tipo de respuesta del backend:
interface LoginApiResponse {
  user: {
    id: string;
    email: string;
    role: string;
    mustChangePassword?: boolean;
    profile?: { firstName?: string; lastName?: string; phone?: string; birthDate?: string };
  };
}
const mapUser = (user: LoginApiResponse["user"]): AuthUser => { ... }

// Para apiFetch — usar tipos específicos:
// ANTES:
const data = await apiFetch<any>("/auth/login", { ... });
// DESPUÉS:
const data = await apiFetch<LoginApiResponse>("/auth/login", { ... });
```

#### `services/dataService.ts`
```typescript
// ANTES (línea 18, 29, 54):
const mapDocuments = (documents: any[]): LegalDocument[]
const mapMember = (user: any): Member
const extractUsers = (resp: any): any[]

// DESPUÉS — tipos de respuesta API:
interface AdminUsersApiResponse {
  users: RawApiUser[];
  total: number;
  pages: number;
}
interface RawApiUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  isActive: boolean;
  deletedAt: string | null;
  profile: { firstName?: string; lastName?: string; phone?: string } | null;
  membership: { status: string } | null;
  medicalIntake: { status: string } | null;
  documents: Array<{ id: string; type: string; signedAt: string | null }>;
}

const mapMember = (user: RawApiUser): Member => { ... }
const extractUsers = (resp: AdminUsersApiResponse | RawApiUser[]): RawApiUser[]

// Para apiFetch:
const data = await apiFetch<AdminUsersApiResponse>("/admin/users");
```

### Tareas
- [ ] Definir `interfaces/apiResponses.ts` con tipos de respuestas del backend
- [ ] Reemplazar `any` en `authService.ts` (3 ocurrencias)
- [ ] Reemplazar `any` en `dataService.ts` (6 ocurrencias)
- [ ] Verificar que el frontend compila: `npx tsc --noEmit` desde raíz

---

## FASE 5 — Dividir notificationService.ts
**Prioridad: MEDIA** | Esfuerzo: ~1.5h | Riesgo: Bajo

### Contexto
`notificationService.ts` (597 líneas) mezcla:
1. **Transport layer**: SSE broadcaster (`sseClients`, `registerSseClient`, `broadcastToUser`)
2. **Persistence layer**: `createNotification`, `listNotifications`, `markRead`, `markAllRead`, `countUnread`
3. **Domain events**: 12 funciones `onXxx` que orquestan notificaciones + emails por evento de negocio

El problema: si quiero testear `onAppointmentBooked` en aislamiento,
tengo que mockear el broadcaster SSE también.

### Archivos a crear

#### `server/src/services/sseService.ts`
```
Responsabilidades ÚNICA: gestionar conexiones SSE activas.

Extraer:
  - sseClients Map
  - MAX_SSE_PER_USER
  - SSE_MAX_SESSION_MS
  - registerSseClient()
  - unregisterSseClient()
  - getSseConnectionCount()
  - broadcastToUser()       ← pasa a ser export (actualmente private)
```

#### `server/src/services/notificationEventHandlers.ts`
```
Responsabilidades: orquestar notificaciones de dominio (in-app + email).

Extraer todas las funciones onXxx:
  - onCustomChargeCreated()
  - onCustomChargeAccepted()
  - onCustomChargePaid()
  - onAppointmentDepositPaid()
  - onAppointmentBooked()
  - onAppointmentConfirmed()
  - onAppointmentCancelledByClinic()
  - onAppointmentCancelledByPatient()
  - onNewMember()
  - onMembershipPaymentFailed()
  - onMembershipActivated()
  - onIntakeApproved()
  - onIntakeRejected()

Imports: notificationService (core) + emailService
```

#### `server/src/services/notificationService.ts` (reducido)
```
Responsabilidades: persistence + admin cache + re-exports.

Mantener:
  - createNotification()
  - notifyAdmins()
  - listNotifications()
  - countUnread()
  - markRead()
  - markAllRead()
  - getAdminIds() + adminIdCache
  - invalidateAdminIdCache()

Agregar re-exports de notificationEventHandlers para backward compat:
  export * from "./notificationEventHandlers";
```

### Tareas
- [ ] Crear `sseService.ts`
- [ ] Crear `notificationEventHandlers.ts`
- [ ] Reducir `notificationService.ts` + agregar re-exports
- [ ] Actualizar `server/src/index.ts` si importa funciones SSE directamente
- [ ] `npm test` → verde
- [ ] `tsc --noEmit` → limpio

---

## FASE 6 — Tests para nuevos services
**Prioridad: ALTA** | Esfuerzo: ~2h | Riesgo: Nulo

### Contexto
Los services creados en la Fase 1 (y los de las Fases 2-5) no tienen tests unitarios.
Un codebase de nivel elite tiene tests para su lógica de negocio crítica.

### Tests a crear

#### `server/tests/loginSecurity.test.ts`
```typescript
describe("loginSecurityService", () => {
  test("isAccountLocked: retorna false cuando no hay lockout")
  test("isAccountLocked: retorna true tras lockout en memoria")
  test("recordLoginFailure: activa lockout tras LOGIN_MAX_FAILURES intentos")
  test("clearLoginFailures: resetea contador y lockout")
  test("_forceLoginLockout: fuerza lockout en memoria")
})
```

#### `server/tests/appointmentEligibility.test.ts`
```typescript
describe("appointmentEligibilityService", () => {
  test("hasClinicalEligibility: retorna intakeOk=true cuando status=approved")
  test("hasClinicalEligibility: retorna membershipOk=true cuando status=active")
  test("resolveTreatmentForAppointment: lanza 404 si tratamiento inactivo")
  test("preferredCabinIdsForTreatment: ordena por prioridad")
  test("deriveAppointmentEndAt: usa durationMinutes del tratamiento")
  test("deriveAppointmentEndAt: usa payloadEndAt si no hay tratamiento")
})
```

#### `server/tests/agendaTimezone.test.ts` (Fase 2)
```typescript
describe("agendaTimezoneUtils", () => {
  test("toZonedParts: convierte correctamente a zona America/Chihuahua")
  test("overlapsRange: detecta overlap parcial")
  test("overlapsRange: retorna false cuando no hay overlap")
  test("bufferedRange: aplica prep y cleanup buffers correctamente")
  test("appointmentRangeForDateKey: retorna null si cita fuera del día")
})
```

#### `server/tests/csvExport.test.ts` (Fase 3)
```typescript
describe("csvExportService", () => {
  test("escapeCsvField: escapa comillas dobles correctamente")
  test("escapeCsvField: envuelve en comillas campos con comas")
  test("escapeCsvField: maneja null y undefined")
})
```

#### `server/tests/AppError.test.ts`
```typescript
describe("AppError", () => {
  test("preserva message, code y statusCode")
  test("notFound: statusCode=404, code=NOT_FOUND")
  test("forbidden: statusCode=403, code=FORBIDDEN")
  test("errorHandler: serializa AppError a JSON con code")
  test("errorHandler: reporta errores 5xx")
})
```

### Tareas
- [ ] `tests/loginSecurity.test.ts`
- [ ] `tests/appointmentEligibility.test.ts`
- [ ] `tests/AppError.test.ts`
- [ ] `tests/agendaTimezone.test.ts` (después de Fase 2)
- [ ] `tests/csvExport.test.ts` (después de Fase 3)
- [ ] Meta: llegar a **200+ tests** passing

---

## FASE 7 — GDPR + Compliance
**Prioridad: ALTA (legal)** | Esfuerzo: ~2h | Riesgo: Bajo

### Contexto
El sistema tiene soft delete pero carece de:
- Endpoint para exportar datos del usuario (GDPR Art. 20 — portabilidad)
- Endpoint para borrado efectivo de datos (GDPR Art. 17 — derecho al olvido)
- Las firmas médicas en BD no están encriptadas

### Tareas

#### Endpoint exportación de datos
```
GET /api/v1/member/my-data
Auth: requireAuth (member ve sus propios datos)

Responde JSON con:
  - Datos del perfil
  - Historial de membresías
  - Historial de citas
  - Historial de pagos
  - Expediente médico (sin signatureImageData — enlace por separado)
  - Notificaciones
  - Audit logs donde el usuario es el sujeto
```

- [ ] Crear handler en `memberSelfServiceController.ts`
- [ ] Agregar ruta en `memberSelfServiceRoutes.ts`
- [ ] Registrar en auditLog: `"member.data_export"`

#### Endpoint borrado efectivo
```
DELETE /api/v1/member/my-account
Auth: requireAuth + verificar password actual

Acción:
  - User.deletedAt = now (ya existe)
  - Anonimizar: email → deleted_<uuid>@velum.deleted, phone → null
  - Revocar todos los refresh tokens
  - Cancelar suscripción Stripe si activa
  - Borrar signatureImageData de medicalIntake
  - Registrar en auditLog: "member.account_deleted"
```

- [ ] Crear handler en `memberSelfServiceController.ts`
- [ ] Agregar ruta en `memberSelfServiceRoutes.ts`
- [ ] Test: verificar que datos quedan anonimizados

#### Encriptación de firmas
```
Problema: signatureImageData almacenada como base64 en texto plano.
Fix: encriptar con AES-256-GCM usando INTEGRATIONS_ENC_KEY al guardar,
     desencriptar al leer.
```

- [ ] Crear `utils/crypto.ts` (verificar si ya existe parcialmente)
- [ ] Función `encryptField(plaintext)` / `decryptField(ciphertext)`
- [ ] Migración: encriptar registros existentes con script one-time
- [ ] Actualizar lectura/escritura en `medicalIntakeController`

---

## FASE 8 — Observabilidad y ADRs
**Prioridad: MEDIA** | Esfuerzo: ~1.5h | Riesgo: Nulo

### Contexto
El código tiene decisiones de diseño no documentadas que generan preguntas
cuando entra un nuevo desarrollador o cuando hay un incidente.

### ADRs a escribir (Architecture Decision Records)

```
docs/adr/
  001-jwt-httponly-cookies.md      — Por qué cookies y no localStorage
  002-dual-path-brute-force.md     — Por qué memoria + DB en loginSecurity
  003-polling-vs-sse-auth.md       — Por qué polling cada 5min en AuthContext
  004-max-refresh-tokens.md        — Por qué 5 tokens máx por usuario
  005-resend-multiple-clients.md   — Por qué 6 clientes Resend distintos
  006-single-process-sse.md        — Limitaciones del broadcaster SSE en-memoria
```

Formato mínimo por ADR:
```markdown
# ADR-XXX: Título
**Estado:** Aceptado
**Fecha:** YYYY-MM-DD

## Contexto
Por qué existía el problema.

## Decisión
Qué se decidió hacer.

## Consecuencias
Trade-offs aceptados. Qué cambiaría si el sistema escala.
```

### Métricas de negocio
```
Agregar a GET /api/v1/health/detailed:
  - sseConnections: getSseConnectionCount()
  - activeMembers: count(membership.status = 'active')
  - appointmentsToday: count(appointment.startAt today)
  - pendingIntakes: count(medicalIntake.status = 'submitted')
```

- [ ] 6 archivos ADR
- [ ] Métricas de negocio en health endpoint
- [ ] Verificar que `utils/crypto.ts` existe y tiene funciones documentadas

---

## Progreso y tracking

```
Fase 1  ✅  +0.7  →  7.9/10
Fase 2  ✅  +0.4  →  8.3/10   (agendaService → 8 módulos + barrel)
Fase 3  ✅  +0.3  →  8.6/10   (adminController → 4 controllers + csvExportService)
Fase 4  ✅  +0.3  →  8.9/10   (frontend: any eliminado, apiTypes.ts completo)
Fase 5  ✅  +0.2  →  9.1/10   (notificationService → sseService + eventHandlers)
Fase 6  🔲  +0.3  →  9.4/10   (tests)
Fase 7  🔲  +0.2  →  9.6/10   (GDPR)
Fase 8  🔲  +0.1  →  9.7/10   (ADRs + observabilidad)
```

**Target final: 9.5–9.7 / 10**

---

## Qué NO se va a hacer (y por qué)

| Idea | Razón para no hacerla ahora |
|------|----------------------------|
| Migrar a monorepo (nx/turborepo) | Overhead innecesario para 1-2 devs |
| Generar tipos desde Prisma en frontend | El contrato de API ya es estable; riesgo > beneficio |
| Reescribir agendaService desde cero | El algoritmo de slots es correcto — solo reorganizar |
| WebSockets en lugar de SSE | SSE es suficiente para notificaciones unidireccionales |
| ORM alternativo a Prisma | Prisma funciona bien; migrar requiere reescribir 200+ queries |
| Migrar a microservicios | El volumen actual no lo justifica; añadiría latencia |
| Redis para caché | La caché en memoria es correcta para instancia única |

---

*Última actualización: 2026-03-30*
*Próxima sesión recomendada: Fase 2 (agendaService split) — es el mayor impacto único*
