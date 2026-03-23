-- AlterTable: add soft-delete fields to User
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletedBy" TEXT;

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
