-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "genres" TEXT[] DEFAULT ARRAY[]::TEXT[];
