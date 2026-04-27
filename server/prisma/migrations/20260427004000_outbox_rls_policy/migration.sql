-- Fase 1.2.b - RLS para OutboxEvent.
--
-- Esta migracion existe separada porque produccion ya habia aplicado
-- 20260427003000_outbox_pattern desde el VPS antes de que se confirmara en Git.

ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "OutboxEvent";

CREATE POLICY tenant_isolation ON "OutboxEvent"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());
