/*
  Warnings:

  - A unique constraint covering the columns `[channelId,importedFrom]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Message_channelId_importedFrom_key" ON "Message"("channelId", "importedFrom");
