-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "chatHudRevealRate" DOUBLE PRECISION NOT NULL DEFAULT 30,
ADD COLUMN     "chatHudSfxUrl" TEXT,
ADD COLUMN     "chatSplashMessages" JSONB;
