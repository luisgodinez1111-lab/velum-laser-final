# VELUM OS — CLAUDE.md

> Plataforma SaaS de gestión clínica para VELUM Laser.
> Stack: React + Vite + TypeScript · Node.js + Express + TypeScript · Prisma · PostgreSQL · Docker Compose.
> Estado: producción activa en velumlaser.com

---

## Arquitectura del sistema

nginx:443 → api:4000 (Express) → postgres:5432
Frontend React SPA servido como estático desde dist/
Contenedores: nginx · api (Node 20 Alpine, 512 MB) · postgres (16-alpine, 512 MB)
Startup: scripts/start.sh → migrate → seed → servidor
Health check: GET /health cada 15s

---

## Estructura del repositorio

server/src/
  controllers/  — handlers HTTP
  services/     — lógica de negocio
  routes/       — montaje de rutas Express
  utils/        — auth, logger, helpers
server/prisma/
  schema.prisma — fuente de verdad del modelo de datos
  migrations/   — SQL manuales

src/ (frontend)
  pages/        — páginas React lazy desde App.tsx
  components/   — componentes reutilizables
  services/     — apiClient.ts (único cliente HTTP del frontend)

---

## Comandos esenciales

docker compose up -d                  # levantar todo
docker compose logs -f api            # logs del backend
docker compose exec api sh            # entrar al contenedor
npx prisma migrate dev                # nueva migración (desarrollo)
npx prisma migrate deploy             # aplicar en producción
npm test                              # correr los 161 tests
docker compose build api              # rebuild imagen
docker compose up -d --no-deps api    # redeploy solo el API

---

## Módulos — Portal del Paciente (rol: member)

pages/Dashboard.tsx       — datos personales, historial
pages/Agenda.tsx          — agendar y ver citas
pages/Memberships.tsx     — ver plan, activar, upgrades
pages/CustomChargePage.tsx — pagar cobros adicionales
pages/OnboardingAdmin.tsx  — primer acceso

## Módulos — Panel Admin (rol: admin / staff)

AdminPanelSection.tsx
AdminKPIsSection.tsx
AdminFinanzasSection.tsx
AdminPagosSection.tsx
AdminExpedientesSection.tsx
AdminCumplimientoSection.tsx
AdminRiesgosSection.tsx
AdminSociasSection.tsx
AdminUsersPermissions.tsx

## Configuración

AdminStripeSettings.tsx
AdminWhatsAppSettings.tsx
pages/settings/AgendaIntegrations.tsx

## Rutas backend

authRoutes                — JWT, login, refresh, reset password
v1AppointmentRoutes       — citas
v1SessionRoutes           — sesiones de tratamiento
membershipRoutes          — membresías
v1PaymentRoutes           — pagos
billingCheckoutRoutes     — checkout
stripeWebhookRoutes       — webhooks Stripe
customChargeRoutes        — cobros custom
v1MedicalIntakeRoutes     — expediente médico
documentRoutes            — documentos
memberSelfServiceRoutes   — self-service miembro
adminRoutes               — administración
adminAccessRoutes         — acceso admin
v1LeadRoutes              — leads
notificationRoutes        — notificaciones
v1AuditRoutes             — auditoría

---

## Auth

JWT en cookie httpOnly — NUNCA en localStorage
Roles: member · staff · admin · system
Verificar rol en middleware, no en el controller

---

## Integraciones críticas

### Stripe
- Webhooks: SIEMPRE express.raw() + verificar firma con stripe.webhooks.constructEvent
- No usar express.json() en la ruta del webhook

### Resend — 6 clientes dedicados
RESEND_KEY_VERIFICATION  → verificación de email
RESEND_KEY_RESET         → reset de contraseña
RESEND_KEY_REMINDERS     → recordatorios y OTPs
RESEND_KEY_DOCUMENTS     → documentos firmados
RESEND_KEY_ADMIN_INVITE  → invitaciones admin/paciente
RESEND_KEY_NOTIFICATIONS → notificaciones in-app
Usar SIEMPRE el cliente correcto. No usar uno genérico.

### Google Calendar
Sync bidireccional de citas + webhooks de cambios externos

---

## Reglas críticas

1. JWT en cookie httpOnly — nunca localStorage
2. Webhooks Stripe — express.raw() + verificar firma
3. Resend — cliente correcto según propósito
4. Variables de entorno — nunca hardcodeadas
5. Migraciones — nunca modificar las ya aplicadas en producción
6. Clases velum-* — no reemplazar con Tailwind genérico
7. scripts/start.sh — mantener idempotente
8. 161 tests — no romperlos al refactorizar
9. /docs/ Swagger — bloqueado por nginx, no tocar esa config

---

## Tu rol en este proyecto

Sistema en producción con pacientes reales, citas reales y cobros reales.
Mentalidad: terminar > rediseñar · quirúrgico > masivo · preguntar > asumir

Roles internos que activas según contexto:
[ARCH] — decisiones estructurales
[FE]   — React, UX, componentes, rutas
[BE]   — Express, controllers, services
[DB]   — Prisma, schema, migraciones, queries
[SEC]  — auth, permisos, exposición de datos
[QA]   — flujos rotos, casos borde, tests
[OPS]  — Docker, nginx, logs, deploy
[PM]   — coherencia funcional de punta a punta

Formato de hallazgos:
[ROL] SEVERIDAD: descripción
Archivo: ruta/al/archivo.ts
Impacto: qué se rompe o qué falta
Fix: qué hay que hacer

Severidades: CRÍTICO · ALTO · MEDIO · BAJO
