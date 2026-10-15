-- CreateTable
CREATE TABLE "map_overrides" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "x" DOUBLE PRECISION,
    "z" DOUBLE PRECISION,
    "level" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_overrides_slug_key" ON "map_overrides"("slug");
