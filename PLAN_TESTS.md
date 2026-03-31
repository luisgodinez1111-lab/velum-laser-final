# Plan de Mejora de Tests — VELUM OS
> Objetivo: pasar de 3/10 → 10/10 en cobertura y calidad de testing  
> Fecha: 2026-03-31 | Framework: Vitest + Supertest

---

## Estado Actual

| Área | Archivos | Tests existentes | Cobertura estimada |
|------|----------|------------------|--------------------|
| Controllers | 28 | 6/28 | ~21% |
| Services | 42 | 6/42 | ~14% |
| Utils | 20 | 4/20 | ~20% |
| Validators | 11 | 2/11 | ~18% |
| Frontend Pages | 26 | 0/26 | 0% |
| Frontend Components | 20 | 0/20 | 0% |
| **TOTAL** | **147** | **43 archivos / 4,621 líneas** | **~15%** |

### Tests que YA existen (no tocar, solo mantener)
```
auth.test.ts, authMiddleware.test.ts, refreshToken.test.ts, jwtAlgorithm.test.ts
loginSecurity.test.ts, passwordHistory.test.ts
appointments.test.ts, appointmentEligibility.test.ts, appointmentToken.test.ts
agendaConflict.test.ts, agendaTimezone.test.ts
customChargeOtp.test.ts, chargeRefunded.test.ts, expireCustomCharges.test.ts
stripeWebhook.test.ts, webhook.test.ts, webhookDedup.test.ts
adminEndpoints.test.ts, adminUserDeletion.test.ts, adminCacheInvalidation.test.ts
AppError.test.ts, baseUrl.test.ts, validators.test.ts, validators2.test.ts
rbac.test.ts, sessionPermissions.test.ts, sseLimit.test.ts
pruneNotifications.test.ts, gcalWebhookToken.test.ts
csvExport.test.ts, exports.test.ts, auditLogsPagination.test.ts
retryAfterHeader.test.ts, activeMembership409.test.ts, duplicateDeposit409.test.ts
gracePeriodPaymentFailed.test.ts, customerDeleted.test.ts, chargeRefunded.test.ts
medicalIntake.test.ts, documentMagicBytes.test.ts, reconciliation.test.ts
integrationWorkerFailures.test.ts, whatsapp.test.ts, routes.test.ts
```

---

## Criterio de éxito (10/10)

1. **Cobertura de líneas ≥ 80%** en backend (medido con `@vitest/coverage-v8`)
2. **Todos los flujos de negocio críticos** testeados con al menos happy path + error path
3. **Todos los validators Zod** testeados con inputs válidos e inválidos
4. **Frontend: componentes críticos** con @testing-library/react
5. **CI/CD**: `npm test` pasa en < 60 segundos en pipeline
6. **Zero tests flaky** — todos deterministas

---

## Fase 0 — Infraestructura (prerequisito, ~2h)

> Sin esto no podemos medir el progreso real.

### Tareas

**0.1 Instalar cobertura de código**
```bash
cd server && npm install --save-dev @vitest/coverage-v8
```

**0.2 Actualizar vitest.config.ts con umbral de cobertura**
```typescript
// server/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
      exclude: [
        'src/index.ts',
        'src/routes/**',
        'dist/**',
        'tests/**',
      ],
    },
    setupFiles: ['./tests/setup.ts'],
  },
})
```

**0.3 Crear tests/setup.ts**
```typescript
// server/tests/setup.ts
import { vi, beforeEach, afterEach } from 'vitest'

// Mock global de Prisma para todos los tests unitarios
vi.mock('../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.restoreAllMocks() })
```

**0.4 Agregar scripts en server/package.json**
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:coverage:open": "vitest run --coverage && open coverage/index.html"
}
```

**0.5 Instalar testing-library para frontend**
```bash
# raíz del proyecto
npm install --save-dev @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

**Resultado:** `npm run test:coverage` genera reporte HTML con % real

### ✅ Baseline medido (2026-03-31)
| Métrica | Resultado |
|---------|-----------|
| Tests backend | 274/274 pasando |
| Tests frontend | 46/46 pasando |
| Statements | 25.03% |
| Branches | 57.42% |
| Functions | 37.80% |
| Lines | 25.03% |

> Flaky test corregido: `agendaConflict.test.ts` — ancla `Date.now()` con `vi.setSystemTime()`

---

## Fase 1 — Validators (BAJO riesgo, ALTO valor, ~4h)

> Los validators son funciones puras — los tests más fáciles de escribir y más confiables.
> Actualmente solo validators.test.ts y validators2.test.ts con cobertura parcial.

### Archivos objetivo

| Archivo | Prioridad | Casos a cubrir |
|---------|-----------|----------------|
| `validators/auth.ts` | ALTA | password strength, email format, OTP format |
| `validators/appointments.ts` | ALTA | fechas, duración, conflictos de campo |
| `validators/medicalIntake.ts` | ALTA | campos requeridos, formatos, longitudes |
| `validators/membership.ts` | MEDIA | planCode válido, períodos |
| `validators/profile.ts` | MEDIA | teléfono, nombre, campos opcionales |
| `validators/agenda.ts` | MEDIA | slots, bloques, configuración |
| `validators/documents.ts` | BAJA | tipo MIME, tamaño |
| `validators/sessions.ts` | BAJA | campos de sesión |
| `validators/leads.ts` | BAJA | email, nombre, fuente |
| `validators/audit.ts` | BAJA | filtros, paginación |
| `validators/admin.ts` | BAJA | roles, permisos |

### Patrón de test para validators

```typescript
// tests/validators/auth.test.ts
import { describe, it, expect } from 'vitest'
import { loginSchema, passwordChangeSchema } from '../../src/validators/auth'

describe('validators/auth — loginSchema', () => {
  it('acepta email y password válidos', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'Abc123!@#xyz' })
    expect(result.success).toBe(true)
  })
  it('rechaza email mal formado', () => {
    const result = loginSchema.safeParse({ email: 'no-es-email', password: 'Abc123!@#' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain('email')
  })
  it('rechaza password débil (< 12 chars)', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'Short1!' })
    expect(result.success).toBe(false)
  })
})
```

**Meta de Fase 1:** 11/11 validators con tests → cobertura validators ~85%

---

## Fase 2 — Utils críticos (~3h)

> Funciones puras de utilería que otros módulos dependen.

### Archivos objetivo

| Archivo | Prioridad | Casos a cubrir |
|---------|-----------|----------------|
| `utils/crypto.ts` | CRÍTICA | encrypt/decrypt round-trip, datos corruptos |
| `utils/totp.ts` | CRÍTICA | generar OTP, verificar OTP, OTP expirado |
| `utils/env.ts` | ALTA | variables presentes, variables faltantes |
| `utils/circuitBreaker.ts` | ALTA | open/closed/half-open states |
| `utils/retry.ts` | ALTA | retries exitosos, max retries alcanzado |
| `utils/pagination.ts` | MEDIA | límites, offsets, páginas |
| `utils/date.ts` | MEDIA | formateos, timezone conversions |
| `utils/strings.ts` | BAJA | sanitización, truncado |

### Ejemplo: crypto.ts

```typescript
// tests/utils/crypto.test.ts
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../src/utils/crypto'

describe('utils/crypto', () => {
  it('round-trip: encrypt → decrypt devuelve el texto original', () => {
    const original = 'dato sensible del paciente'
    expect(decrypt(encrypt(original))).toBe(original)
  })
  it('decrypt con string inválido lanza error', () => {
    expect(() => decrypt('not-encrypted')).toThrow()
  })
  it('dos encrypts del mismo texto producen resultados diferentes (IV aleatorio)', () => {
    const enc1 = encrypt('misma data')
    const enc2 = encrypt('misma data')
    expect(enc1).not.toBe(enc2)  // IV diferente cada vez
  })
})
```

**Meta de Fase 2:** 8/8 utils críticos con tests

---

## Fase 3 — Services críticos sin cobertura (~8h)

> Lógica de negocio central. Requiere mocks de Prisma y servicios externos.

### Patrón de mock recomendado

```typescript
// tests/helpers/prismaMock.ts
import { vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

export const prismaMock = {
  user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  membership: { findFirst: vi.fn(), update: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn() },
  // ... extender según necesidad
} as unknown as PrismaClient

vi.mock('../../src/utils/prisma', () => ({ default: prismaMock }))
```

### Archivos objetivo por sub-área

#### 3A — Email Service (CRÍTICO, ~2h)
```
emailService.ts — 37.9KB, 6 clientes Resend, punto de fallo central
```
Casos a cubrir:
- `sendVerificationEmail` — envío correcto, cliente correcto (RESEND_KEY_VERIFICATION)
- `sendPasswordResetEmail` — cliente RESEND_KEY_RESET
- `sendAppointmentReminder` — cliente RESEND_KEY_REMINDERS
- `sendDocumentEmail` — cliente RESEND_KEY_DOCUMENTS
- Fallo de red → log de error, NO lanza excepción al caller
- Template rendering correcto (nombres, fechas)

#### 3B — Stripe Webhook Service (CRÍTICO, ~2h)
```
stripeWebhookService.ts — 37KB, maneja cobros reales
```
Casos a cubrir:
- `invoice.paid` → activa membresía correctamente
- `invoice.payment_failed` → aplica grace period
- `customer.subscription.deleted` → cancela membresía
- `charge.refunded` → registra reembolso
- Evento duplicado → idempotencia (no procesa dos veces)
- Firma inválida → rechaza request

#### 3C — Billing Checkout Service / Controller (~1h)
```
billingCheckoutController.ts — 7.3KB, crea sesiones Stripe
```
Casos a cubrir:
- Usuario sin membresía activa puede iniciar checkout
- Usuario con membresía activa → 409
- Cupón inválido → error descriptivo
- Precio incorrecto → error

#### 3D — Member Self-Service (~1h)
```
memberSelfServiceController.ts — 13.7KB
```
Casos a cubrir:
- Actualizar perfil propio
- No puede actualizar perfil de otro usuario → 403
- Campos bloqueados (rol, clinicId) no modificables
- Subir foto de perfil

#### 3E — Membership Controllers (~1h)
```
membershipController.ts + membershipAdminController.ts
```
Casos a cubrir:
- Ver mi membresía activa
- Admin ve membresía de cualquier usuario
- Pausar membresía → estado correcto
- Reactivar membresía → valida condiciones

#### 3F — Payments (~1h)
```
v1PaymentController.ts — 6.4KB
```
Casos a cubrir:
- Listar pagos propios (paginado)
- Staff/admin ve pagos de cualquiera
- Filtros por fecha y estado
- Exportar CSV de pagos

**Meta de Fase 3:** 6 áreas críticas cubiertas con happy path + error path

---

## Fase 4 — Controllers sin cobertura (~6h)

> Requieren supertest + app express montado, similar a los tests existentes.

### Patrón existente a seguir
```typescript
// Basado en appointments.test.ts existente
import { describe, it, expect, beforeAll } from 'vitest'
import supertest from 'supertest'
import { app } from '../../src/app'

const agent = supertest(app)

describe('POST /v1/appointments', () => {
  it('crea cita con datos válidos → 201', async () => {
    const res = await agent
      .post('/v1/appointments')
      .set('Cookie', `access_token=${validJwt}`)
      .send({ ... })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })
})
```

### Controllers prioritarios

| Controller | Prioridad | Tests nuevos estimados |
|------------|-----------|----------------------|
| `billingCheckoutController.ts` | ALTA | 5 tests |
| `memberSelfServiceController.ts` | ALTA | 8 tests |
| `v1PaymentController.ts` | ALTA | 6 tests |
| `v1MedicalIntakeController.ts` | ALTA | 7 tests |
| `v1SessionController.ts` | ALTA | 5 tests |
| `membershipController.ts` | ALTA | 4 tests |
| `membershipAdminController.ts` | MEDIA | 4 tests |
| `v1LeadController.ts` | MEDIA | 4 tests |
| `appointmentDepositController.ts` | MEDIA | 4 tests |
| `notificationController.ts` | MEDIA | 3 tests |
| `v1AuditController.ts` | MEDIA | 3 tests |
| `intakeAdminController.ts` | MEDIA | 4 tests |
| `adminStripeConfigController.ts` | BAJA | 3 tests |
| `adminStripePlanController.ts` | BAJA | 3 tests |
| `adminWhatsappConfigController.ts` | BAJA | 2 tests |
| `adminAccessController.ts` | BAJA | 4 tests |
| `googleCalendarIntegrationController.ts` | BAJA | 2 tests |
| `googleCalendarWebhookController.ts` | BAJA | 2 tests |

**Meta de Fase 4:** 18 nuevos archivos de test, ~70 nuevos casos

---

## Fase 5 — Mejora de tests existentes (~3h)

> Algunos tests existentes son muy superficiales. Hay que profundizar.

### Tests a extender

| Test existente | Casos adicionales necesarios |
|----------------|------------------------------|
| `auth.test.ts` (12 líneas) | Ampliar: login con 2FA, login bloqueado, reset de password |
| `whatsapp.test.ts` (24 líneas) | Webhook con firma válida/inválida, mensaje entrante |
| `routes.test.ts` (27 líneas) | Verificar que todas las rutas están montadas |
| `rbac.test.ts` (42 líneas) | Todos los roles × todos los endpoints protegidos |
| `medicalIntake.test.ts` | Edición prohibida después de aprobación |
| `sessionPermissions.test.ts` | Staff puede, member no puede en sus propias sesiones |
| `validators.test.ts` / `validators2.test.ts` | Merge y expandir con casos edge |

### Test de regresión RBAC (crítico)

```typescript
// tests/rbac-matrix.test.ts
// Tabla completa: rol × endpoint × método esperado
const matrix = [
  { role: 'member',  endpoint: 'GET /admin/users',     expected: 403 },
  { role: 'staff',   endpoint: 'GET /admin/users',     expected: 200 },
  { role: 'admin',   endpoint: 'DELETE /admin/users/x', expected: 200 },
  { role: 'member',  endpoint: 'GET /v1/payments',     expected: 200 },
  // ... 40+ combinaciones
]
```

**Meta de Fase 5:** Tests existentes amplios, coverage de branches sube a 70%+

---

## Fase 6 — Frontend crítico (~6h)

> Solo los componentes y páginas que impactan directamente al usuario o cobros.

### Instalación necesaria
```bash
npm install --save-dev @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

### vite.config.ts / vitest config para frontend
```typescript
// vitest.config.ts (raíz)
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.tsx'],
    globals: true,
  },
})
```

### Componentes y páginas prioritarias

| Componente / Página | Prioridad | Casos a cubrir |
|--------------------|-----------|----------------|
| `components/PasswordInput.tsx` | ALTA | toggle visibilidad, strength indicator |
| `pages/Login.tsx` (si existe) | ALTA | submit, error display, loading state |
| `pages/CustomChargePage.tsx` | ALTA | mostrar monto, confirmar pago, OTP input |
| `pages/Memberships.tsx` | ALTA | mostrar plan activo, botón upgrade |
| `components/NotificationBell.tsx` | MEDIA | ya existe test — ampliar |
| `pages/Dashboard.tsx` | MEDIA | datos personales, historial |
| `pages/ResetPassword.tsx` | MEDIA | validación formulario, submit |

### Patrón de test para React

```typescript
// tests/pages/CustomChargePage.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomChargePage } from '../../pages/CustomChargePage'

describe('CustomChargePage', () => {
  it('muestra el monto formateado', () => {
    render(<CustomChargePage charge={{ amount: 150000, currency: 'MXN' }} />)
    expect(screen.getByText(/\$1,500/)).toBeInTheDocument()
  })
  it('botón de pago llama al handler con OTP', async () => {
    const onPay = vi.fn()
    render(<CustomChargePage charge={...} onPay={onPay} />)
    await userEvent.type(screen.getByLabelText(/código/i), '123456')
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    expect(onPay).toHaveBeenCalledWith('123456')
  })
})
```

**Meta de Fase 6:** 7 componentes/páginas críticas con tests

---

## Fase 7 — Google Calendar & Integraciones externas (~3h)

> Las integraciones externas requieren mocks más elaborados.

### Archivos objetivo

| Archivo | Tests a agregar |
|---------|----------------|
| `services/googleCalendarCore.ts` | crear evento, actualizar evento, eliminar evento |
| `services/googleCalendarSyncService.ts` | sync bidireccional, conflictos |
| `services/appointmentReminderService.ts` | recordatorio 24h antes, recordatorio 1h antes |
| `services/paymentReminderService.ts` | recordatorio pago vencido, gracia expirada |
| `services/integrationJobCleanupService.ts` | limpieza de jobs expirados |

### Patrón de mock para APIs externas

```typescript
// tests/helpers/googleMock.ts
import { vi } from 'vitest'

vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        insert: vi.fn().mockResolvedValue({ data: { id: 'gcal-event-123' } }),
        update: vi.fn().mockResolvedValue({ data: { id: 'gcal-event-123' } }),
        delete: vi.fn().mockResolvedValue({}),
      }
    }))
  }
}))
```

---

## Fase 8 — Tests de integración E2E ligeros (~4h)

> No requieren navegador. Son flows completos en memoria con base de datos de test.

### Setup

```bash
# .env.test
DATABASE_URL="postgresql://test:test@localhost:5432/velum_test"
```

### Flows prioritarios

```typescript
// tests/integration/membershipFlow.test.ts
describe('FLOW: activar membresía via Stripe webhook', () => {
  it('checkout.session.completed → membresía activa → email enviado', async () => {
    // 1. Crear usuario en DB de test
    // 2. POST /stripe/webhook con evento checkout.session.completed firmado
    // 3. Verificar DB: membership.status = 'active'
    // 4. Verificar email enviado (mock Resend)
  })
})

// tests/integration/appointmentFlow.test.ts
describe('FLOW: agendar cita completa', () => {
  it('miembro agenda → staff confirma → recordatorio enviado', async () => {
    // ...
  })
})

// tests/integration/customChargeFlow.test.ts
describe('FLOW: cobro personalizado con OTP', () => {
  it('admin crea cargo → miembro recibe OTP → paga → registrado', async () => {
    // ...
  })
})
```

**Flows a cubrir:**
1. Activación de membresía via webhook
2. Agendar y confirmar cita
3. Cobro personalizado con OTP
4. Reset de contraseña completo
5. Onboarding nuevo paciente

---

## Métricas objetivo por fase

| Fase | Esfuerzo | Tests nuevos | Cobertura esperada |
|------|----------|--------------|-------------------|
| 0 — Infraestructura | 2h | 0 | medible |
| 1 — Validators | 4h | ~50 casos | validators: 85% |
| 2 — Utils críticos | 3h | ~30 casos | utils: 75% |
| 3 — Services críticos | 8h | ~60 casos | services críticos: 70% |
| 4 — Controllers faltantes | 6h | ~70 casos | controllers: 75% |
| 5 — Mejora tests existentes | 3h | ~40 casos | branches: 70% |
| 6 — Frontend crítico | 6h | ~35 casos | frontend crítico: 60% |
| 7 — Integraciones externas | 3h | ~25 casos | integraciones: 65% |
| 8 — E2E ligeros | 4h | ~15 flows | flows críticos: 100% |
| **TOTAL** | **~39h** | **~325 casos** | **backend ≥80%, frontend ≥60%** |

---

## Calificación esperada al completar cada fase

| Después de | Nota estimada |
|------------|---------------|
| Estado actual (43 tests) | 3/10 |
| Fase 0 (infraestructura) | 4/10 |
| Fase 0-1 (validators) | 5/10 |
| Fase 0-2 (+ utils) | 5.5/10 |
| Fase 0-3 (+ services críticos) | 6.5/10 |
| Fase 0-4 (+ controllers) | 7.5/10 |
| Fase 0-5 (+ mejoras existentes) | 8/10 |
| Fase 0-6 (+ frontend) | 8.5/10 |
| Fase 0-7 (+ integraciones) | 9/10 |
| Fase 0-8 (+ E2E) | **10/10** |

---

## Reglas del plan

1. **No romper tests existentes** — cada fase debe pasar `npm test` al finalizar
2. **Un archivo de test por módulo** — no dispersar en múltiples archivos pequeños
3. **Nomenclatura**: `[modulo].test.ts` en el mismo nivel que los archivos existentes
4. **Mock externo obligatorio** — Stripe, Resend, Google no deben llamarse en tests
5. **Tests deterministas** — no usar `Date.now()` real, usar `vi.setSystemTime()`
6. **Happy path + al menos 1 error path** por función testeada
7. **Mínimo 3 casos por validator** — válido, inválido, borde

---

## Siguiente paso inmediato

```bash
# Empezar por aquí:
cd server
npm install --save-dev @vitest/coverage-v8
# Luego ejecutar la Fase 0 completa
npm run test:coverage  # ver el baseline real
```

Después arrancar Fase 1 — validators son los más rápidos de escribir y dan el mayor
retorno por hora invertida.
