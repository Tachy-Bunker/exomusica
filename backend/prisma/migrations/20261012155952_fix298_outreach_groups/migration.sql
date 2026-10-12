/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId,key]` on the table `OutreachColumn` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "OutreachColumn_key_key";

-- AlterTable
ALTER TABLE "OutreachBlockType" ADD COLUMN     "workspaceId" INTEGER;

-- AlterTable
ALTER TABLE "OutreachColumn" ADD COLUMN     "workspaceId" INTEGER;

-- AlterTable
ALTER TABLE "OutreachContact" ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "doNotContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "place" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reopensAt" TIMESTAMP(3),
ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "snoozeReason" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "workspaceId" INTEGER;

-- AlterTable
ALTER TABLE "OutreachSend" ADD COLUMN     "accountId" INTEGER,
ADD COLUMN     "blocksUsed" JSONB,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "subjectVariant" TEXT,
ADD COLUMN     "templateName" TEXT,
ADD COLUMN     "workspaceId" INTEGER;

-- CreateTable
CREATE TABLE "OutreachGroup" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutreachGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachTemplate" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "bodyMd" TEXT NOT NULL DEFAULT '',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachScheduled" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "contactId" INTEGER,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachScheduled_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachWorkspace" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "trackLinks" BOOLEAN NOT NULL DEFAULT false,
    "dnc" JSONB NOT NULL DEFAULT '[]',
    "profile" JSONB NOT NULL DEFAULT '{}',
    "attachRules" JSONB NOT NULL DEFAULT '[]',
    "digestOn" BOOLEAN NOT NULL DEFAULT false,
    "digestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachAccount" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "label" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUser" TEXT,
    "smtpPasswordEnc" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "replyTo" TEXT,
    "defaultCc" TEXT,
    "defaultBcc" TEXT,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "sentFolder" TEXT NOT NULL DEFAULT 'Sent',
    "fileInSent" BOOLEAN NOT NULL DEFAULT false,
    "signatureMd" TEXT NOT NULL DEFAULT '',
    "followUpDays" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachFileGroup" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutreachFileGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachFile" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "groupId" INTEGER,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "contactId" INTEGER,
    "direction" TEXT NOT NULL DEFAULT 'in',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "toEmails" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'application',
    "reason" TEXT NOT NULL DEFAULT '',
    "hint" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachFeed" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachLead" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "feedId" INTEGER,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "deadline" TIMESTAMP(3),
    "fee" TEXT,
    "place" TEXT NOT NULL DEFAULT '',
    "emails" JSONB NOT NULL DEFAULT '[]',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'feed',
    "status" TEXT NOT NULL DEFAULT 'new',
    "key" TEXT NOT NULL,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachLink" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contactId" INTEGER,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "lastClickAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OutreachContactToOutreachGroup" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_OutreachContactToOutreachGroup_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachGroup_workspaceId_name_key" ON "OutreachGroup"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "OutreachScheduled_status_sendAt_idx" ON "OutreachScheduled"("status", "sendAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachWorkspace_slug_key" ON "OutreachWorkspace"("slug");

-- CreateIndex
CREATE INDEX "OutreachAccount_workspaceId_idx" ON "OutreachAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "OutreachFileGroup_workspaceId_idx" ON "OutreachFileGroup"("workspaceId");

-- CreateIndex
CREATE INDEX "OutreachFile_workspaceId_groupId_idx" ON "OutreachFile"("workspaceId", "groupId");

-- CreateIndex
CREATE INDEX "OutreachMessage_workspaceId_date_idx" ON "OutreachMessage"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "OutreachMessage_workspaceId_messageId_idx" ON "OutreachMessage"("workspaceId", "messageId");

-- CreateIndex
CREATE INDEX "OutreachMessage_contactId_idx" ON "OutreachMessage"("contactId");

-- CreateIndex
CREATE INDEX "OutreachFeed_workspaceId_idx" ON "OutreachFeed"("workspaceId");

-- CreateIndex
CREATE INDEX "OutreachLead_workspaceId_status_idx" ON "OutreachLead"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachLead_workspaceId_key_key" ON "OutreachLead"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachLink_code_key" ON "OutreachLink"("code");

-- CreateIndex
CREATE INDEX "OutreachLink_workspaceId_contactId_idx" ON "OutreachLink"("workspaceId", "contactId");

-- CreateIndex
CREATE INDEX "_OutreachContactToOutreachGroup_B_index" ON "_OutreachContactToOutreachGroup"("B");

-- CreateIndex
CREATE INDEX "OutreachColumn_workspaceId_idx" ON "OutreachColumn"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachColumn_workspaceId_key_key" ON "OutreachColumn"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "OutreachContact_workspaceId_idx" ON "OutreachContact"("workspaceId");

-- CreateIndex
CREATE INDEX "OutreachSend_workspaceId_idx" ON "OutreachSend"("workspaceId");

-- AddForeignKey
ALTER TABLE "OutreachScheduled" ADD CONSTRAINT "OutreachScheduled_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OutreachContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OutreachContactToOutreachGroup" ADD CONSTRAINT "_OutreachContactToOutreachGroup_A_fkey" FOREIGN KEY ("A") REFERENCES "OutreachContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OutreachContactToOutreachGroup" ADD CONSTRAINT "_OutreachContactToOutreachGroup_B_fkey" FOREIGN KEY ("B") REFERENCES "OutreachGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
