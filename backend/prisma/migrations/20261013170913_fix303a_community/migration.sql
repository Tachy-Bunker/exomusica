-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "reactionEmojiIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
