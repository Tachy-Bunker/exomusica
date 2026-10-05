-- AlterTable
ALTER TABLE "StudyChart" ADD COLUMN     "xLog" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "yLog" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StudyRevision" (
    "id" SERIAL NOT NULL,
    "studyId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyRevision_studyId_createdAt_idx" ON "StudyRevision"("studyId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudyRevision" ADD CONSTRAINT "StudyRevision_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyRevision" ADD CONSTRAINT "StudyRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
