/*
  Warnings:

  - You are about to drop the column `mergedIntoUserId` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_mergedIntoUserId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "mergedIntoUserId",
ADD COLUMN     "linkedUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
