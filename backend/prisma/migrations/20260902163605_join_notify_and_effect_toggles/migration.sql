-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "joinNotifyEmail" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "caEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "moireEnabled" BOOLEAN NOT NULL DEFAULT true;
