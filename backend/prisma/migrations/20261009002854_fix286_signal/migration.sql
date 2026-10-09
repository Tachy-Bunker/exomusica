-- CreateTable
CREATE TABLE "PuzzleNode" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "hint" TEXT,
    "answerSalt" TEXT,
    "answerHash" TEXT,
    "requires" INTEGER[],
    "quorum" INTEGER NOT NULL DEFAULT 0,
    "opensOnDay" INTEGER,
    "rewardText" TEXT,
    "rewardUrl" TEXT,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "rewardItemId" INTEGER,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PuzzleNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleSolve" (
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuzzleSolve_pkey" PRIMARY KEY ("nodeId","userId")
);

-- CreateIndex
CREATE INDEX "PuzzleSolve_nodeId_idx" ON "PuzzleSolve"("nodeId");

-- AddForeignKey
ALTER TABLE "PuzzleNode" ADD CONSTRAINT "PuzzleNode_rewardItemId_fkey" FOREIGN KEY ("rewardItemId") REFERENCES "SampleBankItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleSolve" ADD CONSTRAINT "PuzzleSolve_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "PuzzleNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleSolve" ADD CONSTRAINT "PuzzleSolve_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
