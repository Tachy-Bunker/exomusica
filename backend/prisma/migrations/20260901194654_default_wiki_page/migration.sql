-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "defaultWikiPageId" INTEGER;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_defaultWikiPageId_fkey" FOREIGN KEY ("defaultWikiPageId") REFERENCES "WikiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
