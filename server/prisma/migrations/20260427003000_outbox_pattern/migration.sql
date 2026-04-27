-- Fase 1.2.a - Outbox Pattern
--
-- Garantia: at-least-once delivery de eventos de dominio sin coordinacion
-- distribuida. La escritura del evento vive en la misma transaccion que el
-- cambio de negocio que lo origina.

CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'done', 'failed', 'dead');

CREATE TABLE "OutboxEvent" (
    "id"            TEXT            PRIMARY KEY,
    "tenantId"      TEXT            NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "eventType"     TEXT            NOT NULL,
    "aggregateType" TEXT            NOT NULL,
    "aggregateId"   TEXT            NOT NULL,
    "payload"       JSONB           NOT NULL,
    "status"        "OutboxStatus"  NOT NULL DEFAULT 'pending',
    "attempts"      INTEGER         NOT NULL DEFAULT 0,
    "maxAttempts"   INTEGER         NOT NULL DEFAULT 8,
    "availableAt"   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "lockedUntil"   TIMESTAMPTZ,
    "processedAt"   TIMESTAMPTZ,
    "lastError"     TEXT,
    "createdAt"     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Hot path del worker: filas listas para despachar. La partial index evita que
-- los eventos finalizados dominen el indice cuando la tabla crezca.
CREATE INDEX "OutboxEvent_dispatch_idx" ON "OutboxEvent" ("availableAt", "status")
    WHERE "status" IN ('pending', 'failed');

CREATE INDEX "OutboxEvent_tenantId_status_idx" ON "OutboxEvent" ("tenantId", "status");
CREATE INDEX "OutboxEvent_aggregate_idx" ON "OutboxEvent" ("aggregateType", "aggregateId");
CREATE INDEX "OutboxEvent_eventType_createdAt_idx" ON "OutboxEvent" ("eventType", "createdAt");

ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "OutboxEvent"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

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
  'Outbox pattern: eventos de dominio escritos atomicamente con su transaccion de origen, despachados asincronicamente por worker.';
