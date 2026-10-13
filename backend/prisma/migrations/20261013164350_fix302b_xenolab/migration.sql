-- AlterTable
ALTER TABLE "StudyChart" ADD COLUMN     "sourceFileId" INTEGER;

-- CreateTable
CREATE TABLE "Phenomenon" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "chain" TEXT,
    "exampleTrackId" INTEGER,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Phenomenon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Phenomenon_slug_key" ON "Phenomenon"("slug");

-- AddForeignKey
ALTER TABLE "StudyChart" ADD CONSTRAINT "StudyChart_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phenomenon" ADD CONSTRAINT "Phenomenon_exampleTrackId_fkey" FOREIGN KEY ("exampleTrackId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;
