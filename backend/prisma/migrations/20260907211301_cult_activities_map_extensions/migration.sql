/*
  Warnings:

  - A unique constraint covering the columns `[playlistId]` on the table `ForumMapNode` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sampleBankItemId]` on the table `ForumMapNode` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[challengeId]` on the table `ForumMapNode` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ForumMapNodeType" ADD VALUE 'PLAYLIST';
ALTER TYPE "ForumMapNodeType" ADD VALUE 'SAMPLE_BANK_ITEM';
ALTER TYPE "ForumMapNodeType" ADD VALUE 'CHALLENGE';

-- AlterTable
ALTER TABLE "ForumChannel" ADD COLUMN     "askedById" INTEGER,
ADD COLUMN     "isUserQuestion" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ForumMapNode" ADD COLUMN     "challengeId" INTEGER,
ADD COLUMN     "playlistId" INTEGER,
ADD COLUMN     "sampleBankItemId" INTEGER;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "cultActivitiesChannelId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "ForumMapNode_playlistId_key" ON "ForumMapNode"("playlistId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumMapNode_sampleBankItemId_key" ON "ForumMapNode"("sampleBankItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumMapNode_challengeId_key" ON "ForumMapNode"("challengeId");

-- AddForeignKey
ALTER TABLE "ForumChannel" ADD CONSTRAINT "ForumChannel_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumMapNode" ADD CONSTRAINT "ForumMapNode_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumMapNode" ADD CONSTRAINT "ForumMapNode_sampleBankItemId_fkey" FOREIGN KEY ("sampleBankItemId") REFERENCES "SampleBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumMapNode" ADD CONSTRAINT "ForumMapNode_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
