-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "studyId" INTEGER;

-- CreateIndex
CREATE INDEX "Attachment_studyId_idx" ON "Attachment"("studyId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE SET NULL ON UPDATE CASCADE;
