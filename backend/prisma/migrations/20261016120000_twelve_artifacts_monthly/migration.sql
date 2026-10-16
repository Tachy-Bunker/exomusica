-- Twelve Artifacts (m-artifacts) and the Monthly challenge (m-monthly). Additive only: no existing table changes.

-- CreateTable
CREATE TABLE "artifact_slots" (
    "slot" INTEGER NOT NULL,
    "kind" TEXT,
    "key" TEXT,
    "title" TEXT,
    "text" TEXT,
    "imageUrl" TEXT,
    "notes" JSONB,
    "revealedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifact_slots_pkey" PRIMARY KEY ("slot")
);

-- CreateTable
CREATE TABLE "monthly_bosses" (
    "month" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "rule" TEXT NOT NULL DEFAULT '',
    "trackId" INTEGER,
    "goalUnits" INTEGER NOT NULL,
    "downAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_bosses_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "monthly_contributions" (
    "month" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "listenUnits" INTEGER NOT NULL DEFAULT 0,
    "runUnits" INTEGER NOT NULL DEFAULT 0,
    "lastListenAt" TIMESTAMP(3),
    "lastRunDay" TEXT,

    CONSTRAINT "monthly_contributions_pkey" PRIMARY KEY ("month","userId")
);

-- CreateIndex
CREATE INDEX "monthly_contributions_month_idx" ON "monthly_contributions"("month");

-- AddForeignKey
ALTER TABLE "monthly_contributions" ADD CONSTRAINT "monthly_contributions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
