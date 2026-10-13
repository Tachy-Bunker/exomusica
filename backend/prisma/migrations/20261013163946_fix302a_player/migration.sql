-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "crossfadeMs" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN     "transition" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "fromSketchId" INTEGER,
ADD COLUMN     "fromStudyId" INTEGER;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_fromStudyId_fkey" FOREIGN KEY ("fromStudyId") REFERENCES "Study"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_fromSketchId_fkey" FOREIGN KEY ("fromSketchId") REFERENCES "BranchSketch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
