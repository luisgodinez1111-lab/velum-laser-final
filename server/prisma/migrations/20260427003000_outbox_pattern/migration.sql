-- Fase 1.2.a — Outbox Pattern
--
-- Garantía: at-least-once delivery de eventos de dominio sin coordinación
-- distribuida (ni Kafka, ni transactional outbox de proveedor cloud).
--
-- Patrón:
--   1. El service de negocio escribe el cambio + la fila Outbox en la MISMA
--      transacción Postgres. Si la tx commitea, ambas existen. Si falla,
--      ninguna. Atómico.
--   2. Un worker process lee filas con status='pending' AND availableAt<=NOW(),
--      las marca como 'processing' (lockedUntil), entrega al consumer
--      (notificación, webhook externo, sync GCal, etc.), y marca 'done' o
--      'failed' con backoff exponencial.
--   3. Múltiples workers pueden correr — pg_advisory_xact_lock por fila
--      garantiza que solo uno procesa cada evento.
--
-- Sin Outbox, la única forma de "emitir un evento al cambiar X" es llamar
-- al consumer dentro del mismo request — acopla disponibilidad de servicios
-- externos a la disponibilidad del API. El Outbox desacopla totalmente.

CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'done', 'failed', 'dead');

CREATE TABLE "OutboxEvent" (
    "id"            TEXT            PRIMARY KEY,
    "tenantId"      TEXT            NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "eventType"     TEXT            NOT NULL,                   -- "payment.succeeded", "appointment.canceled", ...
    "aggregateType" TEXT            NOT NULL,                   -- "Payment", "Appointment", ...
    "aggregateId"   TEXT            NOT NULL,                   -- id de la entidad afectada
    "payload"       JSONB           NOT NULL,                   -- snapshot serializable
    "status"        "OutboxStatus"  NOT NULL DEFAULT 'pending',
    "attempts"      INTEGER         NOT NULL DEFAULT 0,
    "maxAttempts"   INTEGER         NOT NULL DEFAULT 8,
    "availableAt"   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),     -- backoff: ready-to-dispatch
    "lockedUntil"   TIMESTAMPTZ,                                -- worker hold (defensivo, además de pg_advisory_lock)
    "processedAt"   TIMESTAMPTZ,
    "lastError"     TEXT,
    "createdAt"     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Índice del hot path del worker: filas listas para despachar.
-- Partial index: solo indexamos filas pendientes/fallidas (las 'done' y 'dead'
-- nunca se vuelven a leer pero ocuparían espacio).
CREATE INDEX "OutboxEvent_dispatch_idx" ON "OutboxEvent" ("availableAt", "status")
    WHERE "status" IN ('pending', 'failed');

-- Índice para reportes/analytics y limpieza retroactiva por tenant.
CREATE INDEX "OutboxEvent_tenantId_status_idx" ON "OutboxEvent" ("tenantId", "status");

-- Búsqueda por agregado: "todos los eventos del Payment X" para debugging.
CREATE INDEX "OutboxEvent_aggregate_idx" ON "OutboxEvent" ("aggregateType", "aggregateId");

-- Búsqueda por tipo de evento (analytics): "todos los payment.succeeded del mes".
CREATE INDEX "OutboxEvent_eventType_createdAt_idx" ON "OutboxEvent" ("eventType", "createdAt");

-- Trigger para mantener updatedAt actualizado.
CREATE OR REPLACE FUNCTION set_outbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_set_updated_at
    BEFORE UPDATE ON "OutboxEvent"
    FOR EACH ROW
    EXECUTE FUNCTION set_outbox_updated_at();

COMMENT ON TABLE "OutboxEvent" IS
  'Outbox pattern: eventos de dominio escritos atómicamente con su transacción de origen, despachados asíncronamente por el worker.';
