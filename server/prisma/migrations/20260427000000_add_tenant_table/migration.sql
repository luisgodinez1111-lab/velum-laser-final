-- Fase 0.1 — Multi-tenancy: tabla raíz `Tenant`
-- Esta migración es REVERSIBLE y NO toca filas existentes.
-- Contrato: el primer tenant tiene id = 'default' para hacer match exacto con
-- las columnas `clinicId` existentes (que tienen DEFAULT 'default'). Esto
-- permite que la migración 0.2 agregue la FK sin necesidad de UPDATE masivo.

-- ── Enum de estado ─────────────────────────────────────────────────
CREATE TYPE "TenantStatus" AS ENUM ('trial', 'active', 'suspended', 'churned');

CREATE TYPE "TenantPlanTier" AS ENUM ('starter', 'professional', 'enterprise', 'internal');

CREATE TYPE "TenantRegion" AS ENUM ('mx', 'us', 'eu');

-- ── Tabla principal ────────────────────────────────────────────────
CREATE TABLE "Tenant" (
    "id"              TEXT            PRIMARY KEY,
    "slug"            TEXT            NOT NULL,
    "legalName"       TEXT            NOT NULL,
    "displayName"     TEXT            NOT NULL,
    "status"          "TenantStatus"  NOT NULL DEFAULT 'trial',
    "planTier"        "TenantPlanTier" NOT NULL DEFAULT 'starter',
    "region"          "TenantRegion"  NOT NULL DEFAULT 'mx',
    "timezone"        TEXT            NOT NULL DEFAULT 'America/Chihuahua',
    "locale"          TEXT            NOT NULL DEFAULT 'es-MX',
    "primaryDomain"   TEXT,
    "billingEmail"    TEXT,
    "contactPhone"    TEXT,
    "taxId"           TEXT,                       -- RFC en MX, EIN en US, VAT en EU
    "features"        JSONB           NOT NULL DEFAULT '{}'::jsonb,
    "limits"          JSONB           NOT NULL DEFAULT '{}'::jsonb,
    "trialEndsAt"     TIMESTAMPTZ,
    "suspendedAt"     TIMESTAMPTZ,
    "suspendedReason" TEXT,
    "createdAt"       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "deletedAt"       TIMESTAMPTZ
);

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX "Tenant_primaryDomain_key" ON "Tenant"("primaryDomain") WHERE "primaryDomain" IS NOT NULL;
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status") WHERE "deletedAt" IS NULL;
CREATE INDEX "Tenant_region_idx" ON "Tenant"("region");

-- ── Seed: tenant inicial de VELUM Laser ────────────────────────────
-- id = 'default' por compatibilidad con `clinicId @default("default")`.
-- Tenants futuros usan cuid; este es el único caso especial documentado.
INSERT INTO "Tenant" (
    "id",
    "slug",
    "legalName",
    "displayName",
    "status",
    "planTier",
    "region",
    "timezone",
    "locale",
    "primaryDomain",
    "billingEmail",
    "features",
    "limits"
) VALUES (
    'default',
    'velum-laser',
    'VELUM Laser',
    'VELUM Laser',
    'active',
    'internal',
    'mx',
    'America/Chihuahua',
    'es-MX',
    'velumlaser.com',
    'admin@velumlaser.com',
    '{"agenda": true, "memberships": true, "customCharges": true, "googleCalendar": true, "whatsapp": true}'::jsonb,
    '{"maxUsers": null, "maxAppointmentsPerMonth": null}'::jsonb
);

-- ── Trigger para mantener updatedAt ────────────────────────────────
CREATE OR REPLACE FUNCTION set_tenant_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_set_updated_at
    BEFORE UPDATE ON "Tenant"
    FOR EACH ROW
    EXECUTE FUNCTION set_tenant_updated_at();
