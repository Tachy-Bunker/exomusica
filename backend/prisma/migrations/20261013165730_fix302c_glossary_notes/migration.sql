-- AlterTable
ALTER TABLE "CommunityTrackComment" ADD COLUMN     "endSeconds" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TrackComment" ADD COLUMN     "endSeconds" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "GlossaryTerm" (
    "id" SERIAL NOT NULL,
    "term" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "definition" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlossaryTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryTerm_term_key" ON "GlossaryTerm"("term");
