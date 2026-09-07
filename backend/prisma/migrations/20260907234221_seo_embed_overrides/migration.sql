-- AlterTable
ALTER TABLE "Collaborator" ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "ogCollaboratorDefaultDescription" TEXT,
ADD COLUMN     "ogCollaboratorDefaultImageUrl" TEXT,
ADD COLUMN     "ogCollaboratorDefaultTitle" TEXT,
ADD COLUMN     "ogForumsIndexDescription" TEXT,
ADD COLUMN     "ogForumsIndexImageUrl" TEXT,
ADD COLUMN     "ogForumsIndexTitle" TEXT;
