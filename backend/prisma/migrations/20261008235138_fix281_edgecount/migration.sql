-- CreateTable
CREATE TABLE "EdgeCount" (
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "n" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeCount_pkey" PRIMARY KEY ("from","to")
);

-- CreateIndex
CREATE INDEX "EdgeCount_from_n_idx" ON "EdgeCount"("from", "n");
