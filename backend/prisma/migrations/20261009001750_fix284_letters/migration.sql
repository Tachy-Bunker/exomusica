-- CreateTable
CREATE TABLE "Letter" (
    "id" SERIAL NOT NULL,
    "authorId" INTEGER NOT NULL,
    "toUserId" INTEGER,
    "entityKey" TEXT,
    "doc" JSONB NOT NULL,
    "unsigned" BOOLEAN NOT NULL DEFAULT false,
    "deliverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterBlock" (
    "blockerId" INTEGER NOT NULL,
    "blockedId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateIndex
CREATE INDEX "Letter_toUserId_deliverAt_idx" ON "Letter"("toUserId", "deliverAt");

-- CreateIndex
CREATE INDEX "Letter_authorId_createdAt_idx" ON "Letter"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Letter_entityKey_expiresAt_idx" ON "Letter"("entityKey", "expiresAt");

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterBlock" ADD CONSTRAINT "LetterBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterBlock" ADD CONSTRAINT "LetterBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
