-- CreateTable
CREATE TABLE "CommunityTrackComment" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "atSeconds" DOUBLE PRECISION NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityTrackComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
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

    CONSTRAINT "OutreachSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachColumn" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "options" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,

    CONSTRAINT "OutreachColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachContact" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "lastSentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSend" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "cc" TEXT,
    "bcc" TEXT,
    "messageId" TEXT,
    "filedInSent" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "batch" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachBlockType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutreachBlockType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachBlock" (
    "id" SERIAL NOT NULL,
    "typeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityTrackComment_trackId_atSeconds_idx" ON "CommunityTrackComment"("trackId", "atSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachColumn_key_key" ON "OutreachColumn"("key");

-- CreateIndex
CREATE INDEX "OutreachContact_followUpAt_idx" ON "OutreachContact"("followUpAt");

-- CreateIndex
CREATE INDEX "OutreachSend_contactId_sentAt_idx" ON "OutreachSend"("contactId", "sentAt");

-- CreateIndex
CREATE INDEX "OutreachSend_sentAt_idx" ON "OutreachSend"("sentAt");

-- AddForeignKey
ALTER TABLE "CommunityTrackComment" ADD CONSTRAINT "CommunityTrackComment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "CommunityTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTrackComment" ADD CONSTRAINT "CommunityTrackComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OutreachContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachBlock" ADD CONSTRAINT "OutreachBlock_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "OutreachBlockType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
