-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "probeColors" JSONB;

-- CreateTable
CREATE TABLE "ProbeScan" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbeScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProbeScan_userId_kind_idx" ON "ProbeScan"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ProbeScan_userId_kind_key_key" ON "ProbeScan"("userId", "kind", "key");

-- AddForeignKey
ALTER TABLE "ProbeScan" ADD CONSTRAINT "ProbeScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
