/*
  Warnings:

  - You are about to drop the column `replayGainDb` on the `CommunityTrack` table. All the data in the column will be lost.
  - You are about to drop the column `replayGainDb` on the `Track` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CommunityTrack" DROP COLUMN "replayGainDb",
ADD COLUMN     "replay_gain_db_v2" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SampleBankItem" ADD COLUMN     "imageAttachmentIds" INTEGER[],
ADD COLUMN     "imageUrls" TEXT[];

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "playHighlightColor" TEXT;

-- AlterTable
ALTER TABLE "Track" DROP COLUMN "replayGainDb",
ADD COLUMN     "replay_gain_db_v2" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "caEnabled" SET DEFAULT false;

-- CreateTable
CREATE TABLE "_StudyBranches" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_StudyBranches_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_StudyBranches_B_index" ON "_StudyBranches"("B");

-- AddForeignKey
ALTER TABLE "_StudyBranches" ADD CONSTRAINT "_StudyBranches_A_fkey" FOREIGN KEY ("A") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StudyBranches" ADD CONSTRAINT "_StudyBranches_B_fkey" FOREIGN KEY ("B") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;
