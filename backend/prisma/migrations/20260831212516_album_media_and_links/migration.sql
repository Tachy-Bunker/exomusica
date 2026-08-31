/*
  Warnings:

  - You are about to drop the column `downloadUrl` on the `Album` table. All the data in the column will be lost.
  - You are about to drop the column `streamUrl` on the `Album` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Album" DROP COLUMN "downloadUrl",
DROP COLUMN "streamUrl";

-- CreateTable
CREATE TABLE "AlbumLink" (
    "id" SERIAL NOT NULL,
    "albumId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AlbumLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlbumGalleryImage" (
    "id" SERIAL NOT NULL,
    "albumId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AlbumGalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackCollaborator" (
    "trackId" INTEGER NOT NULL,
    "collaboratorId" INTEGER NOT NULL,

    CONSTRAINT "TrackCollaborator_pkey" PRIMARY KEY ("trackId","collaboratorId")
);

-- AddForeignKey
ALTER TABLE "AlbumLink" ADD CONSTRAINT "AlbumLink_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumGalleryImage" ADD CONSTRAINT "AlbumGalleryImage_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackCollaborator" ADD CONSTRAINT "TrackCollaborator_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackCollaborator" ADD CONSTRAINT "TrackCollaborator_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "Collaborator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
