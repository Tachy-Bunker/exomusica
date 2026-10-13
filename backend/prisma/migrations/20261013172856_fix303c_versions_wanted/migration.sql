-- CreateTable
CREATE TABLE "CommunityTrackRevision" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "attachmentId" INTEGER,
    "externalUrl" TEXT,
    "answersCommentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityTrackRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchWanted" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "claimedAlbumId" INTEGER,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "BranchWanted_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityTrackRevision_trackId_createdAt_idx" ON "CommunityTrackRevision"("trackId", "createdAt");

-- CreateIndex
CREATE INDEX "BranchWanted_branchId_position_idx" ON "BranchWanted"("branchId", "position");

-- AddForeignKey
ALTER TABLE "CommunityTrackRevision" ADD CONSTRAINT "CommunityTrackRevision_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "CommunityTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTrackRevision" ADD CONSTRAINT "CommunityTrackRevision_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTrackRevision" ADD CONSTRAINT "CommunityTrackRevision_answersCommentId_fkey" FOREIGN KEY ("answersCommentId") REFERENCES "CommunityTrackComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchWanted" ADD CONSTRAINT "BranchWanted_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchWanted" ADD CONSTRAINT "BranchWanted_claimedAlbumId_fkey" FOREIGN KEY ("claimedAlbumId") REFERENCES "CommunityAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;
