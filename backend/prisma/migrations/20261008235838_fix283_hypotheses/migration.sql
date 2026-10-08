-- CreateTable
CREATE TABLE "Hypothesis" (
    "id" SERIAL NOT NULL,
    "authorId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "requirements" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'open',
    "statusNote" TEXT,
    "question" TEXT,
    "stimulusAUrl" TEXT,
    "stimulusBUrl" TEXT,
    "stimulusAAttachmentId" INTEGER,
    "stimulusBAttachmentId" INTEGER,
    "studyId" INTEGER,
    "bonusPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trial" (
    "id" SERIAL NOT NULL,
    "hypothesisId" INTEGER NOT NULL,
    "userId" INTEGER,
    "who" TEXT NOT NULL,
    "pick" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hypothesis_status_idx" ON "Hypothesis"("status");

-- CreateIndex
CREATE INDEX "Trial_hypothesisId_idx" ON "Trial"("hypothesisId");

-- CreateIndex
CREATE UNIQUE INDEX "Trial_hypothesisId_who_key" ON "Trial"("hypothesisId", "who");

-- AddForeignKey
ALTER TABLE "Hypothesis" ADD CONSTRAINT "Hypothesis_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hypothesis" ADD CONSTRAINT "Hypothesis_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
