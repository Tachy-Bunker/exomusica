/*
  Warnings:

  - A unique constraint covering the columns `[previewAttachmentId]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[submissionChannelId]` on the table `CommunityAlbum` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "briefMarkdown" TEXT,
ADD COLUMN     "previewAttachmentId" INTEGER;

-- AlterTable
ALTER TABLE "CommunityAlbum" ADD COLUMN     "submissionChannelId" INTEGER,
ADD COLUMN     "submissionStatus" "SubmissionStatus",
ADD COLUMN     "targetBranchId" INTEGER;

-- CreateTable
CREATE TABLE "BranchSketch" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "attachmentId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchSketch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchSketch_attachmentId_key" ON "BranchSketch"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_previewAttachmentId_key" ON "Branch"("previewAttachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityAlbum_submissionChannelId_key" ON "CommunityAlbum"("submissionChannelId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_previewAttachmentId_fkey" FOREIGN KEY ("previewAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchSketch" ADD CONSTRAINT "BranchSketch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchSketch" ADD CONSTRAINT "BranchSketch_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityAlbum" ADD CONSTRAINT "CommunityAlbum_targetBranchId_fkey" FOREIGN KEY ("targetBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityAlbum" ADD CONSTRAINT "CommunityAlbum_submissionChannelId_fkey" FOREIGN KEY ("submissionChannelId") REFERENCES "ForumChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
