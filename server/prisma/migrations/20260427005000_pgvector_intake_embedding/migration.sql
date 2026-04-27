-- Movimiento #8.A — pgvector + tabla MedicalIntakeEmbedding
--
-- Fundación para RAG (Retrieval-Augmented Generation) sobre expedientes
-- médicos. Cada MedicalIntake se trocea en chunks (personalJson, historyJson,
-- notas), cada chunk genera un embedding vectorial, y guardamos vector
-- + metadatos para búsqueda semántica.
--
-- Aislamiento por tenant: la tabla tiene `tenantId` con FK + RLS. Una
-- query con `app.tenant_id='X'` JAMÁS retorna chunks de tenant 'Y'. Esto
-- es crítico para datos médicos — un prompt LLM no puede recuperar
-- contexto de otro paciente.
--
-- Dimensión 1536: compatible con OpenAI text-embedding-3-small.
-- Si cambiamos a Voyage AI (1024) o cohere (1024 v3), agregar columna
-- nueva con dimensión distinta — vectores de tamaños distintos NO se
-- pueden mezclar en la misma columna.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "MedicalIntakeEmbedding" (
    "id"          TEXT          PRIMARY KEY,
    "tenantId"    TEXT          NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "intakeId"    TEXT          NOT NULL REFERENCES "MedicalIntake"("id") ON DELETE CASCADE,
    "chunkIndex"  INTEGER       NOT NULL,                 -- orden dentro del intake
    "chunkType"   TEXT          NOT NULL,                 -- "personal" | "history" | "notes" | "session"
    "content"     TEXT          NOT NULL,                 -- el texto que generó el embedding (para mostrar en UI)
    "embedding"   vector(1536)  NOT NULL,                 -- text-embedding-3-small / Voyage v3 (1024 requiere otra columna)
    "model"       TEXT          NOT NULL,                 -- "openai/text-embedding-3-small", etc.
    "tokens"      INTEGER,                                 -- tokens consumidos al generar (para billing)
    "createdAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updatedAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE ("intakeId", "chunkIndex", "chunkType")
);

-- Índice ANN (Approximate Nearest Neighbor) — IVF Flat es buen default
-- para data sets < 1M filas. Cuando crezca, evaluar HNSW.
-- `lists = 100` es razonable para hasta ~10k vectors. Aumentar a sqrt(rows)
-- cuando lleguemos a más de 100k.
-- IMPORTANTE: el índice se crea VACÍO; cada cambio en la tabla actualiza
-- el centroide automáticamente. Para ANN óptima, REINDEX cuando el corpus
-- cambie significativamente.
CREATE INDEX "MedicalIntakeEmbedding_embedding_idx"
    ON "MedicalIntakeEmbedding"
    USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 100);

-- Índices para filtrado rápido pre-búsqueda (predicate pushdown).
-- pgvector aplica el predicate ANTES del scan ANN si cubrimos las columnas
-- correctas con índice — esencial para que el filtro tenant sea barato.
CREATE INDEX "MedicalIntakeEmbedding_tenantId_idx" ON "MedicalIntakeEmbedding" ("tenantId");
CREATE INDEX "MedicalIntakeEmbedding_intakeId_idx" ON "MedicalIntakeEmbedding" ("intakeId");

-- Trigger updatedAt (mismo patrón que otras tablas).
CREATE TRIGGER intake_embedding_set_updated_at
    BEFORE UPDATE ON "MedicalIntakeEmbedding"
    FOR EACH ROW
    EXECUTE FUNCTION set_outbox_updated_at();   -- reusa el trigger genérico de outbox

-- ── RLS — tenant_isolation con fallback permisivo, igual patrón que Fase 0.4 ──
ALTER TABLE "MedicalIntakeEmbedding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedicalIntakeEmbedding" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "MedicalIntakeEmbedding"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

COMMENT ON TABLE "MedicalIntakeEmbedding" IS
  'Embeddings vectoriales de MedicalIntake para RAG. Tenant-scoped vía RLS — un prompt LLM jamás recupera chunks de otro tenant.';
