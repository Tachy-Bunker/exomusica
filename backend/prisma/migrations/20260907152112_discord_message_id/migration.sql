/*
  Warnings:

  - A unique constraint covering the columns `[discordMessageId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "discordMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_discordMessageId_key" ON "Message"("discordMessageId");
