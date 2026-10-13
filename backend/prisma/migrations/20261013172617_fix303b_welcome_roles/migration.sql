-- AlterEnum
ALTER TYPE "EmailType" ADD VALUE 'WELCOME_BUDDY';

-- AlterTable
ALTER TABLE "TrackCollaborator" ADD COLUMN     "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "WelcomeBuddy" (
    "id" SERIAL NOT NULL,
    "newUserId" INTEGER NOT NULL,
    "buddyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "WelcomeBuddy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeBuddy_newUserId_key" ON "WelcomeBuddy"("newUserId");

-- CreateIndex
CREATE INDEX "WelcomeBuddy_buddyId_doneAt_idx" ON "WelcomeBuddy"("buddyId", "doneAt");

-- AddForeignKey
ALTER TABLE "WelcomeBuddy" ADD CONSTRAINT "WelcomeBuddy_newUserId_fkey" FOREIGN KEY ("newUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeBuddy" ADD CONSTRAINT "WelcomeBuddy_buddyId_fkey" FOREIGN KEY ("buddyId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
