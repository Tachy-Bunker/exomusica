-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "chartHidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jinglesDone" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "upgradeChoice" JSONB,
ADD COLUMN     "upgradeRetunedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminPanelSeen" (
    "userId" INTEGER NOT NULL,
    "panel" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPanelSeen_pkey" PRIMARY KEY ("userId","panel")
);

-- CreateTable
CREATE TABLE "UserUpgrade" (
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "earnedAt" TIMESTAMP(3),

    CONSTRAINT "UserUpgrade_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "MilestoneSetting" (
    "key" TEXT NOT NULL,
    "target" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reachedAt" TIMESTAMP(3),

    CONSTRAINT "MilestoneSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ProbeScan_kind_key_idx" ON "ProbeScan"("kind", "key");

-- AddForeignKey
ALTER TABLE "AdminPanelSeen" ADD CONSTRAINT "AdminPanelSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUpgrade" ADD CONSTRAINT "UserUpgrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
