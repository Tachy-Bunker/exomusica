import { PrismaClient } from "@prisma/client";
import { sendTemplatedMail } from "./emailTemplates.js";
import type { EmailType } from "./emailTemplates.js";

const prisma = new PrismaClient();

export async function sendActivitySummary(days: number, notifyField: "notifyWeeklySummary" | "notifyDailySummary", emailType: EmailType): Promise<void> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { [notifyField]: true, isGhost: false },
    include: { followedChannels: { include: { channel: true } } },
  });

  let sent = 0;
  for (const user of users) {
    if (!user.email || user.followedChannels.length === 0) continue;

    const lines: string[] = [];
    for (const follow of user.followedChannels) {
      const count = await prisma.message.count({
        where: { channelId: follow.channelId, createdAt: { gte: since }, isDeleted: false },
      });
      if (count > 0) lines.push(`${follow.channel.name}: ${count} new message${count === 1 ? "" : "s"}`);
    }
    if (lines.length === 0) continue;

    await sendTemplatedMail(emailType, user.email, user.username, { summary: lines.join("<br>") });
    sent++;
  }
  console.log(`${emailType} sent to ${sent} of ${users.length} eligible users.`);
  await prisma.$disconnect();
}
