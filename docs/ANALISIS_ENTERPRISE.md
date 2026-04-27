# VELUM OS — Análisis arquitectónico enterprise

> Auditoría desde 8 perspectivas de ingeniería senior. El objetivo no es decorar
> lo que ya existe, sino marcar el delta entre el estado actual y un SaaS B2B
> vendible a enterprise (SOC 2 + multi-tenant real + IA nativa).
>
> Fecha: 2026-04-27 · Branch: `main` · Estado: producción mono-cliente (VELUM Laser).

---

## 0. Estado real del sistema (línea base verificada)

Hechos extraídos del repo, no aspiraciones:

- **Tenancy**: campo `clinicId String @default("default")` en `User`, `Appointment`,
  `IntegrationJob`, etc. (`server/prisma/schema.prisma:86,294,605,672`). Es
  **single-tenant disfrazado** — todo el tráfico cae en `"default"`. No hay
  resolución de tenant por subdominio/JWT, no hay Row-Level Security, no hay
  aislamiento de datos a nivel de Postgres.
- **Runtime**: Express monolítico (`server/src/index.ts`, 325 líneas) corriendo
  en un único contenedor de 512 MB con cron in-process (`node-cron`, workers
  embebidos: `integrationWorker`, `paymentReminderCron`, `appointmentReminderCron`).
  Si se reinicia el API, los crons se pierden hasta el próximo arranque.
- **Datos**: Postgres 16-alpine **single instance**, 512 MB, sin réplica, sin
  PITR documentado, sin pgbouncer. Volumen `postgres_data` local en el host.
- **Infra**: `docker-compose.yml` en **single host, single AZ**, nginx → api →
  postgres. No hay orquestador, no hay autoscaling, no hay multi-región.
- **Observabilidad**: `pino` + `pino-http` + `metricsService` custom + endpoint
  `/health`. **No hay** OpenTelemetry, traces distribuidos, SLOs definidos,
  alertas, error tracking externo (Sentry/Datadog), ni RUM en el frontend.
- **Cola/eventos**: `IntegrationJob` table con worker in-process polleando.
  No hay Redis, no hay BullMQ, no hay broker (Kafka/NATS/SQS), no hay outbox
  pattern para eventos de dominio.
- **Tests**: 161 tests (vitest). Cobertura no medida en CI. Sin tests de carga,
  sin contract testing, sin chaos.
- **Frontend**: React 19 + Vite + Tailwind. SPA servida estática. Sin SSR,
  sin design system formal, sin Storybook, sin métricas Web Vitals.
- **IA/ML**: **inexistente**. Cero superficie de IA en el producto.
- **Compliance**: cero certificaciones. LFPDPPP aplica por jurisdicción
  (México) pero no hay DPA, no hay registro de tratamiento, no hay export/
  delete de sujeto, no hay cifrado a nivel de campo para PHI.

**Veredicto honesto**: el código está limpio para un MVP en producción de un
solo cliente. Para vender a una segunda clínica como SaaS multi-tenant, hay
que reescribir capas; para vender enterprise, hay que construir cuatro capas
que hoy no existen (tenancy real, observabilidad, data platform, IA).

---

## 1. [STAFF] Principal Engineer — Arquitectura distribuida y multi-tenancy

### Hallazgos críticos

**[STAFF] CRÍTICO — Multi-tenancy es un placeholder**
- Archivo: `server/prisma/schema.prisma:86`
- Impacto: cada modelo carga `clinicId @default("default")`. No hay constraint
  cross-table (`Appointment.clinicId` puede divergir de `User.clinicId`), no
  hay tenant resolver en middleware, no hay scoping automático en queries.
  Un bug de un developer = data leak entre clínicas.
- Fix: ver “arquitectura objetivo” abajo.

**[STAFF] ALTO — Cron in-process acoplado al API**
- Archivos: `server/src/index.ts` (importa `startIntegrationWorker`,
  `startPaymentReminderCron`, `startAppointmentReminderCron`,
  `startIntegrationJobCleanupCron`, `renewRecurringCharges`).
- Impacto: escalar el API horizontalmente ejecuta los crons N veces. Hoy no
  hay leader election ni distributed lock — `pg_advisory_lock` o tabla `locks`
  no aparecen en el código.
- Fix: separar `worker` y `scheduler` en procesos/contenedores distintos con
  lock por job.

**[STAFF] ALTO — Acoplamiento de webhooks externos a la transacción del API**
- Stripe / Google Calendar webhooks entran al mismo proceso que sirve UI.
  Un pico de webhooks = degradación del producto. No hay outbox ni retry
  con backoff persistente.

### Arquitectura objetivo (12-18 meses)

```
           ┌────────────────────────────────────────────────┐
           │              Edge / WAF / CDN                  │
           │      (Cloudflare → tenant subdomain routing)   │
           └───────────┬────────────────────────────────────┘
                       │  resuelve tenant_id desde host
                       ▼
        ┌──────────────────────────────┐    ┌────────────────────┐
        │   API Gateway (stateless)    │◄──►│  Auth Service      │
        │   - tenant context inject    │    │  (JWT + sessions)  │
        │   - rate limit por tenant    │    └────────────────────┘
        └─────┬────────────────────────┘
              │
   ┌──────────┼─────────────────────────────────┐
   ▼          ▼                                 ▼
┌─────────┐ ┌─────────────┐               ┌─────────────┐
│ Core API│ │ Booking svc │   …           │ Billing svc │
│ (BFF)   │ │ (citas)     │               │ (Stripe)    │
└────┬────┘ └──────┬──────┘               └──────┬──────┘
     │             │                              │
     │       ┌─────▼──────────────────────────────▼──────┐
     │       │   Event bus (NATS JetStream / Kafka)      │
     │       │   + Outbox pattern desde Postgres         │
     │       └──────┬───────────────┬───────────────┬────┘
     │              │               │               │
     │       ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
     │       │ Workers     │ │ Notifier    │ │ AI/RAG svc  │
     │       │ (BullMQ)    │ │ (email/wa)  │ │ (sec. 5)    │
     │       └─────────────┘ └─────────────┘ └─────────────┘
     ▼
┌─────────────────────────────────────────┐
│  Postgres primary + 1 réplica sync      │
│  + RLS por tenant_id                    │
│  + pgbouncer (transaction pooling)      │
│  + Logical replication → warehouse      │
└─────────────────────────────────────────┘
```

### Invariantes que tienen que volverse ley

1. **Toda query lleva `tenant_id`**. Forzado por RLS, no por convención.
2. **Toda escritura emite evento al outbox** en la misma transacción.
3. **Ningún proceso largo vive en el request path** — se enqueua y responde 202.
4. **`tenant_id` nunca se pasa por body** — siempre se deriva del JWT/host.
5. **Idempotency key obligatoria** en todo POST de mutación (pagos, citas,
   webhooks). Hoy solo Stripe webhook tiene idempotencia parcial.

### Roadmap mínimo

| Fase | Entregable | Bloquea |
|------|------------|---------|
| 0 (1m) | Renombrar `clinicId` → `tenantId`, FK a tabla `Tenant`, backfill | Todo lo demás |
| 1 (2m) | RLS en Postgres + middleware que setea `SET LOCAL app.tenant_id` | SOC 2, segundo cliente |
| 2 (2m) | Separar `worker` y `scheduler` como contenedores propios | Escala horizontal |
| 3 (3m) | Outbox + event bus + primer consumer (notificaciones) | Microservicios futuros |
| 4 (6m) | Extracción de `booking-svc` y `billing-svc` cuando dolor lo justifique | NO antes |

> **Anti-patrón a evitar**: extraer microservicios antes de tener tenancy real
> y observabilidad. Es la trampa donde mueren los SaaS de seed-stage.

---

## 2. [SEC] Senior Security Engineer — Threat model y compliance

### Hallazgos críticos

**[SEC] CRÍTICO — Sin Row-Level Security**
- Archivo: `server/prisma/schema.prisma` (no hay `@@map` con políticas RLS).
- Impacto: el día que entre el segundo tenant, un `WHERE` mal escrito expone
  datos médicos cruzados. No es hipotético — es la #1 causa de incidentes
  multi-tenant documentados.
- Fix: políticas `CREATE POLICY tenant_isolation ON <table> USING
  (tenant_id = current_setting('app.tenant_id')::text)` en cada tabla con
  PHI/PII. Prisma soporta vía `prisma.$executeRaw('SET LOCAL ...')` por
  request en un middleware.

**[SEC] ALTO — PHI sin cifrado a nivel de campo**
- Modelos `MedicalIntake`, `Profile`, `Document` almacenan datos médicos en
  texto plano en Postgres. TLS at-rest del volumen no es suficiente para
  HIPAA/LFPDPPP en caso de dump de DB.
- Fix: `pgcrypto` + envelope encryption con KMS (AWS KMS / GCP KMS / Vault)
  para campos sensibles. DEK por tenant, KEK rotada.

**[SEC] ALTO — JWT secret único y sin rotación**
- `env.jwtSecret` es estático (`server/src/index.ts:50`). No hay JWKS, no hay
  rotación, no hay revocación masiva si se filtra.
- Fix: emisor con kid + rotación automática. Refresh tokens ya existen
  (`refresh_tokens` en migración) — falta key rotation.

**[SEC] MEDIO — Sin CSP estricta ni SRI**
- `helmet()` por defecto no es CSP fuerte. No vi configuración custom.
- Fix: CSP con nonces, SRI en assets, Trusted Types en frontend.

**[SEC] MEDIO — Sin auditoría firmada/append-only**
- Existe `auditService` y `v1AuditController` pero la tabla es
  mutable. SOC 2 CC7.2 exige logs tamper-evident.
- Fix: hash chain (cada fila incluye hash de la anterior) o WORM storage.

### Threat model resumido (STRIDE por componente)

| Componente | Amenaza dominante | Mitigación faltante |
|------------|-------------------|---------------------|
| Auth (JWT cookie) | Token theft via XSS | CSP estricta, cookie SameSite=strict ✓, key rotation ✗ |
| Stripe webhook | Replay / firma falsa | Firma OK ✓, idempotency store ✗ |
| Multer uploads | Path traversal / malware | Antivirus scan ✗, content-type sniffing ✗ |
| Google Calendar OAuth | Token leak | Encrypted at rest ✗, scope minimization ✓ parcial |
| Admin endpoints | Privilege escalation | RBAC ✓, ABAC ✗, break-glass logs ✗ |
| Postgres | SQLi via raw | Prisma parametriza ✓, RLS ✗ |

### Hoja de ruta de compliance

| Cert | Plazo realista | Bloqueadores actuales |
|------|----------------|------------------------|
| **LFPDPPP (MX)** | 3 meses | DPA template, registro de tratamiento, derechos ARCO endpoint, DPO designado |
| **GDPR (si entra UE)** | 6 meses | Data residency EU, DPIA, sub-processor list, right-to-erasure end-to-end |
| **SOC 2 Type I** | 9-12 meses | RLS, audit logs append-only, vendor mgmt, change mgmt, IR plan, pen test anual |
| **SOC 2 Type II** | 18 meses | 6 meses de evidencia continua post-Type I |
| **ISO 27001** | 18-24 meses | ISMS formal, risk register, BCP/DRP testeado |
| **HIPAA-ready** (US) | 12 meses | BAAs con todos los sub-processors, encryption at rest por campo, audit logs 6 años |

> Nota mexicana: **LFPDPPP + NOM-024-SSA3-2010** (expediente clínico
> electrónico) son el piso legal para operar VELUM Laser. Hoy se cumple por
> defecto operacional, no por arquitectura.

---

## 3. [OPS/SRE] Senior SRE / Platform Engineer

### Hallazgos críticos

**[OPS] CRÍTICO — Single point of failure en todo**
- Un host, un Postgres, un API container, un nginx. RTO no medido, RPO depende
  de lo que diga `scripts/backup.sh` (no auditado aquí).
- Fix: replica sync de Postgres + failover (Patroni/RDS Multi-AZ), 2+
  réplicas del API detrás de un LB con health checks reales.

**[OPS] ALTO — Observabilidad casera no escala**
- `metricsService.ts` custom, `getSnapshot()` expone métricas in-memory que
  se pierden en cada restart. No hay Prometheus, no hay Grafana, no hay
  retención.
- Fix: OpenTelemetry SDK (traces + metrics + logs) → OTel Collector →
  backend (Grafana Cloud / Datadog / New Relic). El frontend también:
  Web Vitals + Real User Monitoring.

**[OPS] ALTO — SLOs no existen**
- No hay definición de “qué significa que VELUM esté arriba”.
- Fix: SLOs publicados:
  - **API p95 latencia < 300ms / p99 < 800ms** sobre `/v1/*`.
  - **Disponibilidad 99.9% mensual** (43 min downtime/mes) año 1, 99.95%
    año 2.
  - **Sync Google Calendar lag p95 < 60s**.
  - **Stripe webhook processing < 5s p99**.
- Error budgets vinculados a feature freeze cuando se queman.

**[OPS] MEDIO — Sin runbooks ni on-call**
- No vi `docs/runbooks/` ni rotación PagerDuty. En enterprise deal, el primer
  RFP pregunta esto.

**[OPS] MEDIO — Crons no son idempotentes a nivel observable**
- `appointmentReminderService`, `paymentReminderService`, `renewRecurringCharges`
  corren en un solo nodo. Si fallan, no hay alarma diferenciada.
- Fix: cada cron emite `job_started`, `job_completed`, `job_failed` con
  duración → alerta si no se ve `completed` en X minutos.

### Plataforma objetivo

```
LB (TLS termination, mTLS interno)
  ├─ API replica × N (autoscale CPU/RPS)        — stateless
  ├─ Worker pool × M (autoscale queue depth)    — BullMQ/Temporal
  ├─ Scheduler × 1 (leader-elected)             — pg lock o k8s lease
  ├─ Postgres primary + sync replica + 1 async  — Patroni/RDS
  ├─ Redis cluster (cache + queue + rate-lim)
  └─ Object storage (S3-compatible) para uploads — hoy es volumen local

Observability stack
  ├─ OTel Collector → Grafana / Datadog
  ├─ Sentry (errors)
  ├─ Statuspage público
  └─ Synthetic checks (Checkly) para flujos críticos: login, agendar, pagar
```

### Chaos engineering (cuando 99.95% sea el objetivo)

- Game days mensuales: kill-pod, kill-db-replica, latency-injection a Stripe,
  expirar token de Google Calendar.
- Disaster recovery test trimestral: restore desde backup en entorno limpio,
  cronometrado, documentado.

---

## 4. [DATA] Senior Data Engineer

### Hallazgos críticos

**[DATA] CRÍTICO — Analytics corre sobre la base transaccional**
- `agendaReportService`, `csvExportService`, `auditService` consultan Postgres
  primario. A 10× tráfico actual, un export de un admin tumba el booking de
  un paciente.
- Fix: réplica de lectura para reporting + warehouse (BigQuery / Snowflake /
  ClickHouse) alimentado por CDC.

**[DATA] ALTO — Cero pipeline de datos**
- No hay dbt, no hay Airflow/Dagster, no hay event tracking estructurado
  (Segment/Rudderstack). KPIs admin (`AdminKPIsSection`) se calculan a mano
  por query.
- Fix: capa medallion (bronze→silver→gold) en warehouse con dbt.

**[DATA] ALTO — Sin feature store ni embeddings**
- Pre-requisito para la perspectiva 5 (IA). Si pacientes/sesiones/notas no
  están vectorizadas y materializadas, no hay RAG ni recomendación.

**[DATA] MEDIO — Schema bloat por defaults**
- `clinicId @default("default")` repetido en 7+ modelos. Cuando se vuelva
  `tenantId`, hay que normalizar y crear `Tenant` table como fuente de verdad.

### Stack de datos objetivo

| Capa | Tecnología recomendada | Por qué |
|------|------------------------|---------|
| CDC | Debezium → Kafka, o Postgres logical replication directa | No tocar app |
| Warehouse | BigQuery (México: low ops) o ClickHouse (self-host barato) | Analítica |
| Transformación | dbt-core | Versionado, lineage, tests |
| Orquestación | Dagster (preferido) o Airflow | Asset-based |
| Streaming/eventos | Kafka o NATS JetStream | Compartido con sec. 1 |
| Feature store | Feast (open source) | Compartido entrenamiento/serving |
| Vector DB | pgvector (inicio) → Qdrant/Weaviate (escala) | Aislamiento por tenant |
| Activación | Reverse-ETL (Hightouch/Census) → Stripe, WhatsApp, Resend | Marketing/CRM |
| BI | Metabase (interno) + Looker embebido (cliente) | Product analytics + customer-facing |

### Modelo dimensional mínimo (gold layer)

- `dim_tenant`, `dim_patient`, `dim_staff`, `dim_treatment`, `dim_date`,
  `dim_payment_method`.
- `fact_appointment` (gris, conf, completada, no-show), `fact_payment`,
  `fact_session_treatment`, `fact_membership_event`, `fact_notification`.
- KPIs derivados: LTV por paciente, churn de membresía, ocupación de cabina,
  tasa de no-show por staff, MRR/ARR del SaaS.

---

## 5. [AI/ML] AI/ML Engineer — IA como capa nativa

> **Tesis**: en 2026, un SaaS clínico sin IA nativa pierde frente a uno que la
> tenga. La ventana competitiva está aquí, no en otro CRUD.

### Hallazgos

- **Estado actual**: cero. No hay endpoint de inferencia, no hay embeddings,
  no hay agente. La oportunidad es total.

### Arquitectura de IA nativa

```
┌──────────────────────────────────────────────────┐
│  Producto (UI + API)                              │
└────────────┬──────────────────────────┬───────────┘
             │ /ai/* endpoints          │
             ▼                          ▼
   ┌──────────────────┐        ┌────────────────────┐
   │ Model Router     │        │ Eval & Telemetry   │
   │ - intent class   │        │ - Braintrust /     │
   │ - cost-aware     │        │   LangSmith        │
   │ - fallback       │        │ - prod traces      │
   └─────┬────────────┘        └────────────────────┘
         │
   ┌─────▼─────┬───────────────┬───────────────┐
   ▼           ▼               ▼               ▼
┌───────┐ ┌──────────┐ ┌──────────────┐ ┌─────────────┐
│ Haiku │ │ Sonnet   │ │ Opus 4.7     │ │ Self-hosted │
│ 4.5   │ │ 4.6      │ │ (clinical    │ │ open model  │
│ (fast)│ │ (default)│ │  reasoning)  │ │ (PHI-safe)  │
└───────┘ └──────────┘ └──────────────┘ └─────────────┘
              │
        ┌─────▼──────────────────────────┐
        │   RAG layer (tenant-scoped)    │
        │   - pgvector / Qdrant          │
        │   - chunks por tenant_id       │
        │   - re-ranker (Cohere)         │
        └────────────────────────────────┘
```

### Casos de uso de mayor ROI (priorizados)

1. **Resumen automático de expediente** — `MedicalIntake` + `SessionTreatment`
   → resumen al inicio de cada cita. RAG sobre historial del paciente.
2. **Triage inteligente de leads** (`v1LeadController`) — clasificación de
   intención + propuesta de tratamiento. Cierra ventas sin staff.
3. **Asistente de agenda** — “muéveme la cita de Ana al jueves, no
   sobreescribas la de Lupe” → tool calling sobre `agendaService`.
4. **Detección de no-show** (clásico ML, no LLM) — gradient boosting sobre
   features históricas. Alimenta política de depósitos.
5. **Voice intake** — transcripción Whisper + extracción a `MedicalIntake`.
6. **Generación de notas SOAP** post-sesión.

### Reglas no negociables (IA en salud)

1. **Aislamiento de RAG por tenant** a nivel de índice o filtro forzado.
   Un prompt nunca puede traer chunks de otro tenant.
2. **PHI nunca a modelos sin BAA**. Para Anthropic API: usar AWS Bedrock con
   BAA o cliente Enterprise. Para datos especialmente sensibles, considerar
   un modelo open self-hosted (Llama / Mistral).
3. **Evals como ciudadano de primera**. Cada caso de uso tiene golden set
   versionado, tests de regresión, y bloqueo de deploy si baja el score.
4. **Human-in-the-loop obligatorio** para cualquier output que toque
   diagnóstico, dosis, o cobro. La IA propone, el humano firma.
5. **Trazabilidad completa**: cada output de IA persiste prompt, versión de
   modelo, contexto recuperado, y feedback humano.
6. **Prompt caching agresivo** (Anthropic prompt cache) para system prompts
   clínicos largos — paga por tenant ~70% menos en latencia.

### Stack mínimo

- **Inferencia**: Anthropic API (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) con
  prompt caching.
- **Evals**: Braintrust o LangSmith.
- **RAG**: pgvector (fase 1) → Qdrant (fase 2 cuando >1M chunks).
- **Orquestación de agentes**: Claude Agent SDK + tool use estructurado
  contra los services existentes (`agendaService`, `customChargeService`).
- **Fine-tuning**: solo cuando los evals demuestren que prompting + RAG
  topa. Empezar con LoRA por tenant grande.

---

## 6. [FE-PRODUCT] Senior Full-Stack — Product Engineering

### Hallazgos

- Stack actual permite shippear rápido (React 19 + Vite + Express + Prisma).
- **Pero** no hay capa BFF, no hay tipos compartidos cliente/servidor (el
  frontend re-define `types.ts`), no hay codegen desde OpenAPI/Zod.
  `services/apiClient.ts` es un fetch-wrapper artesanal.
- No hay feature flags (LaunchDarkly / Unleash / GrowthBook). Cada experimento
  es un deploy.

### Recomendaciones

- **Tipos end-to-end**: Zod schemas en `server/src/validators/` ya existen —
  exportarlos al cliente con `tsup` o moverse a tRPC/oRPC para flujos
  internos.
- **Feature flags**: GrowthBook self-hosted para experiments + kill switches.
  Crítico para multi-tenant rollouts canary.
- **Velocity hygiene**: PR template, conventional commits, CI con typecheck +
  test + build + Lighthouse en cada PR.
- **Plantilla de feature**: cada feature nueva entra con (a) migración Prisma,
  (b) Zod validator, (c) service test, (d) componente con story (sec. 7),
  (e) flag, (f) métrica.

---

## 7. [FE-DESIGN] Senior Frontend / Design Engineer

### Hallazgos

- `index.css` + clases `velum-*` (CLAUDE.md regla 6) sugieren design system
  ad-hoc en CSS — no es sistema, es convención.
- No hay Storybook, no hay tokens de diseño, no hay tests visuales.
- Sin Web Vitals tracking.
- 169 entradas en `node_modules` apunta a build pesado — bundle size no
  monitoreado.

### Plan

1. **Design tokens** (`packages/tokens/`): color, spacing, type, motion,
   exportados a CSS vars + Tailwind theme.
2. **Componentes primitivos** sobre Radix UI o Ark UI (accesibilidad gratis).
3. **Storybook + Chromatic** para regresión visual.
4. **Performance budget** en CI: bundle JS inicial < 180 KB gzip,
   LCP p75 < 2.5s, INP p75 < 200ms.
5. **Accesibilidad**: WCAG 2.2 AA como gate de PR (axe-core).
6. **Patient portal vs Admin panel**: dos shells distintas con bundle split
   real. Hoy se sirven juntas desde un mismo `dist/`.

### Por qué importa para enterprise

Linear, Vercel y Notion ganan deals de 6 cifras porque la app *se siente*
mejor. En B2B de salud 2026+, staff médico que usa el sistema 8h/día compara
contra Doctoralia, Nimbo, Clinicminds — la diferencia se mide en clicks por
flujo y latencia percibida.

---

## 8. [EM] Engineering Manager / Tech Lead

### Cuándo entra este rol

Hoy: 1 desarrollador (tú). EM no aplica. **Entra cuando el equipo llega a
6 personas** o cuando el Staff (sec. 1) se vuelve cuello de botella en
decisiones técnicas + reviews + hiring simultáneamente.

### Hitos previos al hire

| Equipo | Necesidad |
|--------|-----------|
| 1 (hoy) | Foco: sec. 1, 2, 3 — fundaciones |
| 2-3 | Hire #1: Senior full-stack (sec. 6). Hire #2: Senior SRE/Platform (sec. 3) |
| 4-5 | Hire: Senior security (sec. 2) en preparación SOC 2 |
| 6 | Hire: AI engineer (sec. 5) cuando exista capa de datos (sec. 4) |
| 7-8 | Hire: EM/Tech Lead (sec. 8) + Data engineer (sec. 4) |

### Procesos que el EM debe instalar día 1

- **RFC process** (`docs/rfcs/NNNN-titulo.md`) para cualquier cambio que
  toque más de un servicio o modifique el modelo de datos.
- **On-call rotation** con runbooks (sec. 3) y blameless postmortems
  obligatorios.
- **Career ladder** (IC1→Staff) público — hiring sin esto es lotería.
- **Engineering metrics**: DORA (deploy freq, lead time, MTTR, change fail
  rate). No vanity, sí accionables.
- **Quarterly planning** atado a SLOs (sec. 3) y error budget — si se
  quema, freeze de features.

---

## Resumen ejecutivo — los 10 movimientos que importan

Ordenados por ratio impacto/esfuerzo, no por gusto:

1. **Tenancy real**: rename `clinicId`→`tenantId`, FK a `Tenant`, RLS en
   Postgres, middleware que hace `SET LOCAL`. *Bloquea todo lo demás.*
2. **Outbox + worker process separado**: extrae crons del API, garantiza
   delivery de eventos.
3. **OpenTelemetry + Sentry + Grafana Cloud**: observabilidad real en
   < 2 semanas, paga por sí sola al primer incidente.
4. **Postgres replica + PITR + backup test mensual**: línea base de
   continuidad.
5. **Cifrado de campo PHI con KMS**: pre-requisito legal y comercial.
6. **OpenAPI → tipos cliente automáticos + feature flags**: dobla la
   velocidad de feature delivery.
7. **Warehouse + dbt mínimo**: saca analytics del primario, habilita IA.
8. **RAG tenant-aware sobre `MedicalIntake` + Sonnet 4.6**: primer feature
   de IA con ROI claro (resumen de paciente).
9. **Design tokens + Storybook + Web Vitals budgets**: consistencia y
   percepción de calidad.
10. **SOC 2 Type I kickoff** (auditor, gap assessment) cuando 1-5 estén
    en producción.

---

## Anti-patrones que VELUM debe evitar

- Reescribir a microservicios antes de tener tenancy + observabilidad.
- IA bolted-on (un endpoint `/ai/chat` que solo proxea a Claude). La IA
  vive dentro de los flujos de producto, no en una pestaña aparte.
- Comprar Datadog enterprise antes de tener SLOs definidos.
- Multi-región antes de tener single-region 99.9% probado 6 meses.
- Postgres → MongoDB / event sourcing porque “escala”. Postgres aguanta
  hasta 100k tenants si está bien indexado y particionado.
- Fine-tuning antes de evals.
- Hire de EM antes de los 6 ICs.

---

*Este documento es la línea base. Cada sección merece su propio RFC con
diseño detallado, métricas de éxito y plan de migración antes de ejecutarse.*
