-- Fase 12 / B.1 — Feedback estructurado de sesiones
-- Agrega chips multi-select, severidad calculada, y respuesta clínica del staff.

ALTER TABLE "SessionTreatment"
  ADD COLUMN "feedbackChipsJson"          JSONB,
  ADD COLUMN "feedbackSeverity"           TEXT,
  ADD COLUMN "feedbackHasAdverseReaction" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "feedbackResponseNote"       TEXT,
  ADD COLUMN "feedbackRespondedBy"        TEXT,
  ADD COLUMN "feedbackRespondedAt"        TIMESTAMP(3);

ALTER TABLE "SessionTreatment"
  ADD CONSTRAINT "SessionTreatment_feedbackRespondedBy_fkey"
  FOREIGN KEY ("feedbackRespondedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SessionTreatment_feedbackHasAdverseReaction_idx"
  ON "SessionTreatment" ("feedbackHasAdverseReaction");

CREATE INDEX "SessionTreatment_feedbackRespondedAt_idx"
  ON "SessionTreatment" ("feedbackRespondedAt");
