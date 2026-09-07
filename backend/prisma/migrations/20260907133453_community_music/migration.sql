-- CreateEnum
CREATE TYPE "SampleKind" AS ENUM ('AUDIO', 'PATCH', 'SCRIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "TrackPermission" AS ENUM ('LISTEN_ONLY', 'CREDIT_REQUIRED', 'FREE_REMIX');

-- AlterTable
ALTER TABLE "CommunityTrack" ADD COLUMN     "permission" "TrackPermission" NOT NULL DEFAULT 'LISTEN_ONLY',
ADD COLUMN     "remixOfId" INTEGER;

-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN     "fxSettingsJson" JSONB;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "spotlightCommunityTrackId" INTEGER;

-- CreateTable
CREATE TABLE "SampleBankItem" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "kind" "SampleKind" NOT NULL,
    "attachmentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleBankItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeSubmission" (
    "id" SERIAL NOT NULL,
    "challengeId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityTrackLike" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityTrackLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistCollaborator" (
    "id" SERIAL NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SampleBankItem_attachmentId_key" ON "SampleBankItem"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeSubmission_challengeId_trackId_key" ON "ChallengeSubmission"("challengeId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityTrackLike_trackId_userId_key" ON "CommunityTrackLike"("trackId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistCollaborator_playlistId_userId_key" ON "PlaylistCollaborator"("playlistId", "userId");

-- AddForeignKey
ALTER TABLE "SampleBankItem" ADD CONSTRAINT "SampleBankItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleBankItem" ADD CONSTRAINT "SampleBankItem_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeSubmission" ADD CONSTRAINT "ChallengeSubmission_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeSubmission" ADD CONSTRAINT "ChallengeSubmission_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "CommunityTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeSubmission" ADD CONSTRAINT "ChallengeSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTrack" ADD CONSTRAINT "CommunityTrack_remixOfId_fkey" FOREIGN KEY ("remixOfId") REFERENCES "CommunityTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTrackLike" ADD CONSTRAINT "CommunityTrackLike_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "CommunityTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTrackLike" ADD CONSTRAINT "CommunityTrackLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistCollaborator" ADD CONSTRAINT "PlaylistCollaborator_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistCollaborator" ADD CONSTRAINT "PlaylistCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
