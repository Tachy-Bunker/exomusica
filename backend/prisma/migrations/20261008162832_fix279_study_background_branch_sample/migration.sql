-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "sampleCommunityTrackId" INTEGER,
ADD COLUMN     "sampleTrackId" INTEGER;

-- AlterTable
ALTER TABLE "Study" ADD COLUMN     "backgroundUrl" TEXT;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_sampleTrackId_fkey" FOREIGN KEY ("sampleTrackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_sampleCommunityTrackId_fkey" FOREIGN KEY ("sampleCommunityTrackId") REFERENCES "CommunityTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
