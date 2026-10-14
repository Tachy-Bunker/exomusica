-- CreateTable
CREATE TABLE "texture_assets" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "png" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "texture_assets_pkey" PRIMARY KEY ("id")
);
