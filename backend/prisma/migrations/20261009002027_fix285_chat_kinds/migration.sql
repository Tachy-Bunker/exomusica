-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "data" JSONB,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'text';

-- CreateTable
CREATE TABLE "PollVote" (
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "option" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("messageId","userId")
);

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
