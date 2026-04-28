-- Fase 1.5 Slice B — RLS en tablas hijas de auth/identity (PII).
--
-- Tablas: Profile, RefreshToken, EmailVerificationToken, PasswordResetToken,
--         ConsentOtpToken, PasswordHistory, WhatsappOtp, DeleteOtp.
--
-- Mismo patrón que Slice A (20260428000000):
--   1. ADD COLUMN "tenantId" TEXT (nullable transitorio)
--   2. Backfill desde "User"."clinicId" via JOIN por userId
--      (DeleteOtp usa actorUserId; el resto userId)
--   3. SET NOT NULL + DEFAULT 'default' (back-compat)
--   4. FK a "Tenant"("id") + INDEX
--   5. ENABLE + FORCE ROW LEVEL SECURITY + policy con fallback permisivo
--
-- Notas específicas Slice B:
--   - Estas tablas son PII pero típicamente corta-vida (tokens, OTPs).
--     Aún así merecen aislamiento — un token de tenant A no debe ser
--     consultable bajo contexto del tenant B.
--   - `RefreshToken` es la pieza más caliente (login flow). Pre-auth flows
--     no tienen tenantContext, así que dependen del fallback permisivo
--     del policy. Cuando se elimine el fallback (Fase 2 deuda),
--     habrá que añadir policy especial para lookup-by-tokenHash.

-- ── 0. Profile ────────────────────────────────────────────────────────
ALTER TABLE "Profile" ADD COLUMN "tenantId" TEXT;
UPDATE "Profile" p SET "tenantId" = u."clinicId"
  FROM "User" u WHERE p."userId" = u."id";
ALTER TABLE "Profile" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Profile" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Profile_tenantId_idx" ON "Profile"("tenantId");

ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Profile"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 1. RefreshToken ───────────────────────────────────────────────────
ALTER TABLE "RefreshToken" ADD COLUMN "tenantId" TEXT;
UPDATE "RefreshToken" rt SET "tenantId" = u."clinicId"
  FROM "User" u WHERE rt."userId" = u."id";
ALTER TABLE "RefreshToken" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RefreshToken_tenantId_idx" ON "RefreshToken"("tenantId");

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RefreshToken"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 2. EmailVerificationToken ─────────────────────────────────────────
ALTER TABLE "EmailVerificationToken" ADD COLUMN "tenantId" TEXT;
UPDATE "EmailVerificationToken" t SET "tenantId" = u."clinicId"
  FROM "User" u WHERE t."userId" = u."id";
ALTER TABLE "EmailVerificationToken" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EmailVerificationToken" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "EmailVerificationToken_tenantId_idx" ON "EmailVerificationToken"("tenantId");

ALTER TABLE "EmailVerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailVerificationToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmailVerificationToken"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 3. PasswordResetToken ─────────────────────────────────────────────
ALTER TABLE "PasswordResetToken" ADD COLUMN "tenantId" TEXT;
UPDATE "PasswordResetToken" t SET "tenantId" = u."clinicId"
  FROM "User" u WHERE t."userId" = u."id";
ALTER TABLE "PasswordResetToken" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PasswordResetToken" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PasswordResetToken_tenantId_idx" ON "PasswordResetToken"("tenantId");

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordResetToken"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 4. ConsentOtpToken ────────────────────────────────────────────────
ALTER TABLE "ConsentOtpToken" ADD COLUMN "tenantId" TEXT;
UPDATE "ConsentOtpToken" t SET "tenantId" = u."clinicId"
  FROM "User" u WHERE t."userId" = u."id";
ALTER TABLE "ConsentOtpToken" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ConsentOtpToken" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "ConsentOtpToken" ADD CONSTRAINT "ConsentOtpToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ConsentOtpToken_tenantId_idx" ON "ConsentOtpToken"("tenantId");

ALTER TABLE "ConsentOtpToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentOtpToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConsentOtpToken"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 5. PasswordHistory ────────────────────────────────────────────────
ALTER TABLE "PasswordHistory" ADD COLUMN "tenantId" TEXT;
UPDATE "PasswordHistory" ph SET "tenantId" = u."clinicId"
  FROM "User" u WHERE ph."userId" = u."id";
ALTER TABLE "PasswordHistory" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PasswordHistory" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "PasswordHistory" ADD CONSTRAINT "PasswordHistory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PasswordHistory_tenantId_idx" ON "PasswordHistory"("tenantId");

ALTER TABLE "PasswordHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordHistory"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 6. WhatsappOtp ────────────────────────────────────────────────────
ALTER TABLE "WhatsappOtp" ADD COLUMN "tenantId" TEXT;
UPDATE "WhatsappOtp" w SET "tenantId" = u."clinicId"
  FROM "User" u WHERE w."userId" = u."id";
ALTER TABLE "WhatsappOtp" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "WhatsappOtp" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "WhatsappOtp" ADD CONSTRAINT "WhatsappOtp_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "WhatsappOtp_tenantId_idx" ON "WhatsappOtp"("tenantId");

ALTER TABLE "WhatsappOtp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsappOtp" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsappOtp"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── 7. DeleteOtp ──────────────────────────────────────────────────────
-- Caso especial: no tiene userId — usa actorUserId (NOT NULL @unique).
-- Si por alguna razón el actor ya no existe, fallback a 'default'.
ALTER TABLE "DeleteOtp" ADD COLUMN "tenantId" TEXT;
UPDATE "DeleteOtp" d SET "tenantId" = COALESCE(
  (SELECT "clinicId" FROM "User" WHERE "id" = d."actorUserId"),
  'default'
);
ALTER TABLE "DeleteOtp" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "DeleteOtp" ALTER COLUMN "tenantId" SET DEFAULT 'default';
ALTER TABLE "DeleteOtp" ADD CONSTRAINT "DeleteOtp_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DeleteOtp_tenantId_idx" ON "DeleteOtp"("tenantId");

ALTER TABLE "DeleteOtp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeleteOtp" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeleteOtp"
  USING      (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id())
  WITH CHECK (app_current_tenant_id() IS NULL OR "tenantId" = app_current_tenant_id());

-- ── Sanity check con velumapp ─────────────────────────────────────────
DO $$
DECLARE
  visible_no_ctx INT;
  visible_default INT;
  visible_bogus INT;
  tbl TEXT;
  tables TEXT[] := ARRAY['Profile','RefreshToken','EmailVerificationToken','PasswordResetToken','ConsentOtpToken','PasswordHistory','WhatsappOtp','DeleteOtp'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'velumapp') THEN
    RAISE NOTICE 'sanity skip: rol velumapp no existe en este entorno';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('GRANT SELECT ON %I TO velumapp', tbl);
  END LOOP;

  EXECUTE 'SET LOCAL ROLE velumapp';

  FOREACH tbl IN ARRAY tables LOOP
    PERFORM set_config('app.tenant_id', '', true);
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO visible_no_ctx;

    PERFORM set_config('app.tenant_id', 'default', true);
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO visible_default;

    PERFORM set_config('app.tenant_id', 'tenant-no-existe', true);
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO visible_bogus;

    IF visible_no_ctx <> visible_default THEN
      RAISE EXCEPTION 'sanity FAIL en %: sin contexto (%) != tenant default (%)',
        tbl, visible_no_ctx, visible_default;
    END IF;
    IF visible_bogus <> 0 THEN
      RAISE EXCEPTION 'sanity FAIL en %: tenant inexistente debería ver 0, ve %',
        tbl, visible_bogus;
    END IF;

    RAISE NOTICE 'RLS sanity OK en %: no_ctx=% default=% bogus=%',
      tbl, visible_no_ctx, visible_default, visible_bogus;
  END LOOP;

  RESET ROLE;
END $$;
