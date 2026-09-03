-- CreateEnum
CREATE TYPE "BranchVisibility" AS ENUM ('VISIBLE', 'HIDDEN', 'BABY_CRYSTALS');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "visibility" "BranchVisibility" NOT NULL DEFAULT 'VISIBLE';
