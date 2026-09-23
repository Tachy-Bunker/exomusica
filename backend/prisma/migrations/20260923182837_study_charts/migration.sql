-- CreateEnum
CREATE TYPE "StudyChartKind" AS ENUM ('LINE', 'BAR', 'SCATTER', 'TABLE');

-- CreateTable
CREATE TABLE "StudyChart" (
    "id" SERIAL NOT NULL,
    "studyId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "StudyChartKind" NOT NULL DEFAULT 'LINE',
    "xLabel" TEXT,
    "yLabel" TEXT,
    "dataCsv" TEXT NOT NULL,

    CONSTRAINT "StudyChart_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StudyChart" ADD CONSTRAINT "StudyChart_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;
