-- AddColumn loginFailedCount and loginLockedUntil to User for DB-backed brute force protection
ALTER TABLE "User" ADD COLUMN "loginFailedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "loginLockedUntil" TIMESTAMP(3);
