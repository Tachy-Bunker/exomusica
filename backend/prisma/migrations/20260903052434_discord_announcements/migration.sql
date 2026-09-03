-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "discordAnnounceChannelId" TEXT,
ADD COLUMN     "discordAnnounceEvents" JSONB,
ADD COLUMN     "joinNotifyDiscordUsername" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discordUsername" TEXT,
ADD COLUMN     "notifyDiscordDailySummary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyDiscordFollowedReplies" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyDiscordPrivateMessage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyDiscordWeeklySummary" BOOLEAN NOT NULL DEFAULT false;
