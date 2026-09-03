/*
  Warnings:

  - A unique constraint covering the columns `[discordUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "joinNotifyDiscordUserId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discordUserId" TEXT,
ADD COLUMN     "exclusiveMediaPlayback" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "User_discordUserId_key" ON "User"("discordUserId");
