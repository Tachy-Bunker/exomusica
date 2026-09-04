/*
  Warnings:

  - You are about to drop the column `links` on the `Collaborator` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ForumMapNodeType" AS ENUM ('TOPIC', 'ACTIVE_BRANCHES', 'GROWING_SEEDS');

-- AlterTable
ALTER TABLE "AlbumLink" ADD COLUMN     "linkIconId" INTEGER;

-- AlterTable
ALTER TABLE "Collaborator" DROP COLUMN "links",
ADD COLUMN     "legacyLinksJson" JSONB;

-- CreateTable
CREATE TABLE "LinkIcon" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "LinkIcon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaboratorLink" (
    "id" SERIAL NOT NULL,
    "collaboratorId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "linkIconId" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollaboratorLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumMapNode" (
    "id" SERIAL NOT NULL,
    "type" "ForumMapNodeType" NOT NULL DEFAULT 'TOPIC',
    "channelId" INTEGER,
    "parentId" INTEGER,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ForumMapNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumMapNode_channelId_key" ON "ForumMapNode"("channelId");

-- AddForeignKey
ALTER TABLE "AlbumLink" ADD CONSTRAINT "AlbumLink_linkIconId_fkey" FOREIGN KEY ("linkIconId") REFERENCES "LinkIcon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorLink" ADD CONSTRAINT "CollaboratorLink_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "Collaborator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorLink" ADD CONSTRAINT "CollaboratorLink_linkIconId_fkey" FOREIGN KEY ("linkIconId") REFERENCES "LinkIcon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumMapNode" ADD CONSTRAINT "ForumMapNode_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ForumChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumMapNode" ADD CONSTRAINT "ForumMapNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ForumMapNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
