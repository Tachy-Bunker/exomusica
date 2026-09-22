-- AlterTable
ALTER TABLE "CommunityTrack" ADD COLUMN     "genres" TEXT[] DEFAULT ARRAY[]::TEXT[];
