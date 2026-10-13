-- AlterTable
ALTER TABLE "OutreachAccount" ADD COLUMN     "inboxCheckedAt" TIMESTAMP(3),
ADD COLUMN     "inboxError" TEXT,
ADD COLUMN     "inboxFolder" TEXT NOT NULL DEFAULT 'INBOX',
ADD COLUMN     "inboxLastUid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inboxOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inboxValidity" TEXT;
