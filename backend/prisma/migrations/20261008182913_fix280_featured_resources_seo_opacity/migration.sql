-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "identityBgOpacity" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;

-- AlterTable
ALTER TABLE "SampleBankItem" ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT,
ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payNote" TEXT,
ADD COLUMN     "paypalUrl" TEXT,
ADD COLUMN     "price" TEXT;

-- AlterTable
ALTER TABLE "Study" ADD COLUMN     "backgroundOpacity" DOUBLE PRECISION,
ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;

-- CreateTable
CREATE TABLE "ResourceCoupon" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" INTEGER,
    "note" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceUnlock" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "couponId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturedArticle" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "refSlug" TEXT NOT NULL,
    "text" TEXT,
    "imageUrl" TEXT,
    "imageOpacity" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourceCoupon_code_key" ON "ResourceCoupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceUnlock_userId_itemId_key" ON "ResourceUnlock"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedArticle_kind_refSlug_key" ON "FeaturedArticle"("kind", "refSlug");

-- AddForeignKey
ALTER TABLE "ResourceCoupon" ADD CONSTRAINT "ResourceCoupon_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SampleBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceUnlock" ADD CONSTRAINT "ResourceUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceUnlock" ADD CONSTRAINT "ResourceUnlock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SampleBankItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceUnlock" ADD CONSTRAINT "ResourceUnlock_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "ResourceCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
