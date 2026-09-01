-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "guideAssetId" INTEGER,
ADD COLUMN     "voiceoverText" TEXT,
ADD COLUMN     "voiceoverUrl" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "ambienceUrl" TEXT;

-- CreateTable
CREATE TABLE "GuideAsset" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "gifUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuideAsset_name_key" ON "GuideAsset"("name");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_guideAssetId_fkey" FOREIGN KEY ("guideAssetId") REFERENCES "GuideAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
