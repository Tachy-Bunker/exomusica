/*
  Warnings:

  - A unique constraint covering the columns `[discordChannelId]` on the table `ForumChannel` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ForumChannel" ADD COLUMN     "discordChannelId" TEXT,
ADD COLUMN     "discordWebhookUrl" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "discordBotToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ForumChannel_discordChannelId_key" ON "ForumChannel"("discordChannelId");
