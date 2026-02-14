-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('in_app', 'email', 'whatsapp');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'read');

-- CreateTable
CREATE TABLE "SessionTreatment" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "zones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "laserSettings" JSONB NOT NULL DEFAULT '{}',
    "skinResponse" TEXT,
    "fitzpatrickUsed" TEXT,
    "energyDelivered" TEXT,
    "notes" TEXT,
    "beforePhotoKey" TEXT,
    "afterPhotoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'in_app',
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "leadId" TEXT,
    "fbp" TEXT,
    "fbc" TEXT,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "sourceUrl" TEXT,
    "customData" JSONB,
    "sentToMeta" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionTreatment_appointmentId_idx" ON "SessionTreatment"("appointmentId");

-- CreateIndex
CREATE INDEX "SessionTreatment_userId_idx" ON "SessionTreatment"("userId");

-- CreateIndex
CREATE INDEX "SessionTreatment_staffUserId_idx" ON "SessionTreatment"("staffUserId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEvent_eventId_key" ON "MarketingEvent"("eventId");

-- CreateIndex
CREATE INDEX "MarketingEvent_eventName_idx" ON "MarketingEvent"("eventName");

-- CreateIndex
CREATE INDEX "MarketingEvent_sentToMeta_idx" ON "MarketingEvent"("sentToMeta");

-- AddForeignKey
ALTER TABLE "SessionTreatment" ADD CONSTRAINT "SessionTreatment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTreatment" ADD CONSTRAINT "SessionTreatment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTreatment" ADD CONSTRAINT "SessionTreatment_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
