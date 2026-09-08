/*
  Warnings:

  - A unique constraint covering the columns `[coverAttachmentId]` on the table `CommunityAlbum` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CommunityAlbum" ADD COLUMN     "coverAttachmentId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CommunityAlbum_coverAttachmentId_key" ON "CommunityAlbum"("coverAttachmentId");

-- AddForeignKey
ALTER TABLE "CommunityAlbum" ADD CONSTRAINT "CommunityAlbum_coverAttachmentId_fkey" FOREIGN KEY ("coverAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
