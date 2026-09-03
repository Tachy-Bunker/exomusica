-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;

-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;

-- AlterTable
ALTER TABLE "ForumChannel" ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "faviconUrl" TEXT,
ADD COLUMN     "ogAlbumDefaultDescription" TEXT,
ADD COLUMN     "ogAlbumDefaultImageUrl" TEXT,
ADD COLUMN     "ogAlbumDefaultTitle" TEXT,
ADD COLUMN     "ogBranchDefaultDescription" TEXT,
ADD COLUMN     "ogBranchDefaultImageUrl" TEXT,
ADD COLUMN     "ogBranchDefaultTitle" TEXT,
ADD COLUMN     "ogForumDefaultDescription" TEXT,
ADD COLUMN     "ogForumDefaultImageUrl" TEXT,
ADD COLUMN     "ogForumDefaultTitle" TEXT,
ADD COLUMN     "ogHomepageDescription" TEXT,
ADD COLUMN     "ogHomepageImageUrl" TEXT,
ADD COLUMN     "ogHomepageTitle" TEXT,
ADD COLUMN     "ogNewsDefaultDescription" TEXT,
ADD COLUMN     "ogNewsDefaultImageUrl" TEXT,
ADD COLUMN     "ogNewsDefaultTitle" TEXT,
ADD COLUMN     "ogWikiDefaultDescription" TEXT,
ADD COLUMN     "ogWikiDefaultImageUrl" TEXT,
ADD COLUMN     "ogWikiDefaultTitle" TEXT;

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;
