-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "crystalCount" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "FxSettings" ADD COLUMN     "spacingMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.3;
