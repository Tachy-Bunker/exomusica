/*
  Warnings:

  - You are about to drop the column `wardenCount` on the `FxSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FxSettings" DROP COLUMN "wardenCount",
ADD COLUMN     "wardenSizeMax" DOUBLE PRECISION NOT NULL DEFAULT 44,
ADD COLUMN     "wardenSizeMin" DOUBLE PRECISION NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "accentPrimaryColor" TEXT,
ADD COLUMN     "contentTextScaleDesktop" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
ADD COLUMN     "contentTextScaleMobile" DOUBLE PRECISION NOT NULL DEFAULT 1.6;
