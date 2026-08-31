-- CreateEnum
CREATE TYPE "AboutFeatureKind" AS ENUM ('COLLABORATOR', 'AWARD', 'CUSTOM');

-- CreateTable
CREATE TABLE "AboutFeature" (
    "id" SERIAL NOT NULL,
    "kind" "AboutFeatureKind" NOT NULL DEFAULT 'COLLABORATOR',
    "collaboratorId" INTEGER,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AboutFeature_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AboutFeature" ADD CONSTRAINT "AboutFeature_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "Collaborator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
