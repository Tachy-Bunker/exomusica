/*
  Warnings:

  - You are about to drop the column `volumeSfx` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "volumeSfx",
ADD COLUMN     "volumeSfxIdle" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
ADD COLUMN     "volumeSfxPlaying" DOUBLE PRECISION NOT NULL DEFAULT 0.6;
