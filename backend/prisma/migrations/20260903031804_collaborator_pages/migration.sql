/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Collaborator` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[linkedUserId]` on the table `Collaborator` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Collaborator" ADD COLUMN     "linkedUserId" INTEGER,
ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "CollaboratorGalleryImage" (
    "id" SERIAL NOT NULL,
    "collaboratorId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollaboratorGalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collaborator_slug_key" ON "Collaborator"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Collaborator_linkedUserId_key" ON "Collaborator"("linkedUserId");

-- AddForeignKey
ALTER TABLE "Collaborator" ADD CONSTRAINT "Collaborator_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorGalleryImage" ADD CONSTRAINT "CollaboratorGalleryImage_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "Collaborator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
