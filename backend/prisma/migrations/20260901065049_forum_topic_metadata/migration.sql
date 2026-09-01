-- AlterTable
ALTER TABLE "ForumChannel" ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;
