-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultFontId" INTEGER,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_defaultFontId_fkey" FOREIGN KEY ("defaultFontId") REFERENCES "CustomFont"("id") ON DELETE SET NULL ON UPDATE CASCADE;
