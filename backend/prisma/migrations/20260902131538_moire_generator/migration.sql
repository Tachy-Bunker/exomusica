/*
  Warnings:

  - You are about to drop the column `staticAmt` on the `SiteSettings` table. All the data in the column will be lost.
  - You are about to drop the column `staticSpeed` on the `SiteSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SiteSettings" DROP COLUMN "staticAmt",
DROP COLUMN "staticSpeed",
ADD COLUMN     "moireImageUrl" TEXT,
ADD COLUMN     "moireOffsetMax" DOUBLE PRECISION NOT NULL DEFAULT 20,
ADD COLUMN     "moireOffsetMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "moireOffsetSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
ADD COLUMN     "moireOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
ADD COLUMN     "moireRotationSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
ADD COLUMN     "moireSize" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "moireWaveform" TEXT NOT NULL DEFAULT 'sine';
