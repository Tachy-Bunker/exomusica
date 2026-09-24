-- CreateTable
CREATE TABLE "ContributorPointsEntry" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "submissionId" INTEGER,
    "awardedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributorPointsEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContributorPointsEntry" ADD CONSTRAINT "ContributorPointsEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributorPointsEntry" ADD CONSTRAINT "ContributorPointsEntry_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CommunityAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributorPointsEntry" ADD CONSTRAINT "ContributorPointsEntry_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
