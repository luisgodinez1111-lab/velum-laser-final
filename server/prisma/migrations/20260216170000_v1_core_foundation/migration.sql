-- Baseline + additive migration for clean and existing databases.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('member', 'staff', 'admin', 'system');
  ELSE
    ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'system';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MembershipStatus') THEN
    CREATE TYPE "MembershipStatus" AS ENUM ('inactive', 'active', 'past_due', 'canceled', 'paused');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentStatus') THEN
    CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'signed', 'rejected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntakeStatus') THEN
    CREATE TYPE "IntakeStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentStatus') THEN
    CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'confirmed', 'completed', 'canceled', 'no_show');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'member',
  "stripeCustomerId" TEXT,
  "emailVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

CREATE TABLE IF NOT EXISTS "Profile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "phone" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Chihuahua',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Profile_userId_key" ON "Profile"("userId");

CREATE TABLE IF NOT EXISTS "Membership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'inactive',
  "planId" TEXT,
  "stripeSubscriptionId" TEXT,
  "currentPeriodEnd" TIMESTAMP(3),
  "gracePeriodEndsAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_key" ON "Membership"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_stripeSubscriptionId_key" ON "Membership"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership"("userId");

CREATE TABLE IF NOT EXISTS "Document" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
  "version" TEXT,
  "signedAt" TIMESTAMP(3),
  "storageKey" TEXT,
  "signatureKey" TEXT,
  "contentType" TEXT,
  "size" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Document_storageKey_key" ON "Document"("storageKey");
CREATE INDEX IF NOT EXISTS "Document_userId_idx" ON "Document"("userId");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "actorUserId" TEXT,
  "targetUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "result" TEXT,
  "ip" TEXT,
  "metadata" JSONB,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "targetUserId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "resourceType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "resourceId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "result" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ip" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "metadataJson" JSONB;

CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_targetUserId_idx" ON "AuditLog"("targetUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_resourceType_idx" ON "AuditLog"("resourceType");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_stripeEventId_key" ON "WebhookEvent"("stripeEventId");

CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "consent" BOOLEAN NOT NULL,
  "convertedUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Lead_email_idx" ON "Lead"("email");
CREATE INDEX IF NOT EXISTS "Lead_phone_idx" ON "Lead"("phone");
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx" ON "Lead"("createdAt");

CREATE TABLE IF NOT EXISTS "MarketingAttribution" (
  "id" TEXT NOT NULL,
  "leadId" TEXT,
  "userId" TEXT,
  "eventName" TEXT,
  "eventId" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmTerm" TEXT,
  "utmContent" TEXT,
  "fbp" TEXT,
  "fbc" TEXT,
  "fbclid" TEXT,
  "consent" BOOLEAN,
  "metaStatus" TEXT,
  "metaError" TEXT,
  "requestSummary" JSONB,
  "responseSummary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "MarketingAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingAttribution_leadId_key" ON "MarketingAttribution"("leadId");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingAttribution_eventId_key" ON "MarketingAttribution"("eventId");
CREATE INDEX IF NOT EXISTS "MarketingAttribution_userId_idx" ON "MarketingAttribution"("userId");
CREATE INDEX IF NOT EXISTS "MarketingAttribution_eventName_idx" ON "MarketingAttribution"("eventName");
CREATE INDEX IF NOT EXISTS "MarketingAttribution_metaStatus_idx" ON "MarketingAttribution"("metaStatus");
CREATE INDEX IF NOT EXISTS "MarketingAttribution_createdAt_idx" ON "MarketingAttribution"("createdAt");

CREATE TABLE IF NOT EXISTS "MedicalIntake" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "IntakeStatus" NOT NULL DEFAULT 'draft',
  "personalJson" JSONB,
  "historyJson" JSONB,
  "phototype" INTEGER,
  "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
  "signatureKey" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicalIntake_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MedicalIntake_userId_key" ON "MedicalIntake"("userId");
CREATE INDEX IF NOT EXISTS "MedicalIntake_status_idx" ON "MedicalIntake"("status");
CREATE INDEX IF NOT EXISTS "MedicalIntake_approvedByUserId_idx" ON "MedicalIntake"("approvedByUserId");

CREATE TABLE IF NOT EXISTS "Appointment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
  "reason" TEXT,
  "canceledReason" TEXT,
  "canceledAt" TIMESTAMP(3),
  "rescheduledFromId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Appointment_userId_idx" ON "Appointment"("userId");
CREATE INDEX IF NOT EXISTS "Appointment_createdByUserId_idx" ON "Appointment"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Appointment_startAt_endAt_idx" ON "Appointment"("startAt", "endAt");
CREATE INDEX IF NOT EXISTS "Appointment_status_idx" ON "Appointment"("status");

CREATE TABLE IF NOT EXISTS "SessionTreatment" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT,
  "userId" TEXT NOT NULL,
  "staffUserId" TEXT NOT NULL,
  "laserParametersJson" JSONB,
  "notes" TEXT,
  "adverseEvents" TEXT,
  "memberFeedback" TEXT,
  "feedbackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionTreatment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SessionTreatment_userId_idx" ON "SessionTreatment"("userId");
CREATE INDEX IF NOT EXISTS "SessionTreatment_staffUserId_idx" ON "SessionTreatment"("staffUserId");
CREATE INDEX IF NOT EXISTS "SessionTreatment_appointmentId_idx" ON "SessionTreatment"("appointmentId");

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "membershipId" TEXT,
  "stripeEventId" TEXT,
  "stripeInvoiceId" TEXT,
  "stripePaymentIntentId" TEXT,
  "stripeSubscriptionId" TEXT,
  "amount" INTEGER,
  "currency" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "paidAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripeEventId_key" ON "Payment"("stripeEventId");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripeInvoiceId_key" ON "Payment"("stripeInvoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId");
CREATE INDEX IF NOT EXISTS "Payment_membershipId_idx" ON "Payment"("membershipId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Profile_userId_fkey') THEN
    ALTER TABLE "Profile"
      ADD CONSTRAINT "Profile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_userId_fkey') THEN
    ALTER TABLE "Membership"
      ADD CONSTRAINT "Membership_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_userId_fkey') THEN
    ALTER TABLE "Document"
      ADD CONSTRAINT "Document_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey') THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_actorUserId_fkey') THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_targetUserId_fkey') THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailVerificationToken_userId_fkey') THEN
    ALTER TABLE "EmailVerificationToken"
      ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey') THEN
    ALTER TABLE "PasswordResetToken"
      ADD CONSTRAINT "PasswordResetToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_convertedUserId_fkey') THEN
    ALTER TABLE "Lead"
      ADD CONSTRAINT "Lead_convertedUserId_fkey"
      FOREIGN KEY ("convertedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketingAttribution_leadId_fkey') THEN
    ALTER TABLE "MarketingAttribution"
      ADD CONSTRAINT "MarketingAttribution_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketingAttribution_userId_fkey') THEN
    ALTER TABLE "MarketingAttribution"
      ADD CONSTRAINT "MarketingAttribution_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MedicalIntake_userId_fkey') THEN
    ALTER TABLE "MedicalIntake"
      ADD CONSTRAINT "MedicalIntake_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MedicalIntake_approvedByUserId_fkey') THEN
    ALTER TABLE "MedicalIntake"
      ADD CONSTRAINT "MedicalIntake_approvedByUserId_fkey"
      FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_userId_fkey') THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT "Appointment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_createdByUserId_fkey') THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT "Appointment_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_rescheduledFromId_fkey') THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT "Appointment_rescheduledFromId_fkey"
      FOREIGN KEY ("rescheduledFromId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionTreatment_appointmentId_fkey') THEN
    ALTER TABLE "SessionTreatment"
      ADD CONSTRAINT "SessionTreatment_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionTreatment_userId_fkey') THEN
    ALTER TABLE "SessionTreatment"
      ADD CONSTRAINT "SessionTreatment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionTreatment_staffUserId_fkey') THEN
    ALTER TABLE "SessionTreatment"
      ADD CONSTRAINT "SessionTreatment_staffUserId_fkey"
      FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_userId_fkey') THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_membershipId_fkey') THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_membershipId_fkey"
      FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
