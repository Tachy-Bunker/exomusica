-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "fontId" INTEGER;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "fontId" INTEGER;

-- AlterTable
ALTER TABLE "ForumChannel" ADD COLUMN     "fontId" INTEGER;

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN     "fontId" INTEGER;

-- CreateTable
CREATE TABLE "CustomFont" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFont_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomFont_name_key" ON "CustomFont"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFont_familyName_key" ON "CustomFont"("familyName");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_fontId_fkey" FOREIGN KEY ("fontId") REFERENCES "CustomFont"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumChannel" ADD CONSTRAINT "ForumChannel_fontId_fkey" FOREIGN KEY ("fontId") REFERENCES "CustomFont"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_fontId_fkey" FOREIGN KEY ("fontId") REFERENCES "CustomFont"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_fontId_fkey" FOREIGN KEY ("fontId") REFERENCES "CustomFont"("id") ON DELETE SET NULL ON UPDATE CASCADE;
