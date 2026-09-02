/*
  Warnings:

  - You are about to drop the column `caBurst` on the `FxSettings` table. All the data in the column will be lost.
  - You are about to drop the column `caInitial` on the `FxSettings` table. All the data in the column will be lost.
  - You are about to drop the column `staticAmt` on the `FxSettings` table. All the data in the column will be lost.
  - You are about to drop the column `staticSpeed` on the `FxSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FxSettings" DROP COLUMN "caBurst",
DROP COLUMN "caInitial",
DROP COLUMN "staticAmt",
DROP COLUMN "staticSpeed";

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "caBurst" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
ADD COLUMN     "caInitial" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
ADD COLUMN     "smtpFrom" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPassword" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ADD COLUMN     "smtpUser" TEXT,
ADD COLUMN     "staticAmt" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
ADD COLUMN     "staticSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0.55;
