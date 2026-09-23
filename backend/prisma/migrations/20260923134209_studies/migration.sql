/*
  Warnings:

  - A unique constraint covering the columns `[studyId]` on the table `ForumMapNode` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETE');

-- AlterEnum
ALTER TYPE "ForumMapNodeType" ADD VALUE 'STUDY';

-- AlterTable
ALTER TABLE "ForumMapNode" ADD COLUMN     "studyId" INTEGER;

-- CreateTable
CREATE TABLE "Study" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "channelId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Study_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyAnnotation" (
    "id" SERIAL NOT NULL,
    "studyId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "StudyAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Study_slug_key" ON "Study"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Study_channelId_key" ON "Study"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumMapNode_studyId_key" ON "ForumMapNode"("studyId");

-- AddForeignKey
ALTER TABLE "Study" ADD CONSTRAINT "Study_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Study" ADD CONSTRAINT "Study_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ForumChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyAnnotation" ADD CONSTRAINT "StudyAnnotation_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumMapNode" ADD CONSTRAINT "ForumMapNode_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;
