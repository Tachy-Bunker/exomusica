-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('WEEKLY_SUMMARY', 'DAILY_SUMMARY', 'TOPIC_REPLY', 'PRIVATE_MESSAGE', 'JOIN_APPROVED', 'NEWS', 'CALL_FOR_IDEAS', 'CALL_FOR_ARTISTS');

-- AlterTable
ALTER TABLE "ChannelFollow" ADD COLUMN     "notifyOnReply" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyCallsForArtists" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyCallsForIdeas" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyDailySummary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyNews" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "type" "EmailType" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("type")
);
