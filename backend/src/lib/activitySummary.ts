import { PrismaClient } from "@prisma/client";
import { sendTemplatedMail } from "./emailTemplates.js";
import type { EmailType } from "./emailTemplates.js";
import { sendDiscordDM } from "./discordBot.js";

const prisma = new PrismaClient();

export async function sendActivitySummary(
  days: number,
  notifyField: "notifyWeeklySummary" | "notifyDailySummary",
  discordField: "notifyDiscordWeeklySummary" | "notifyDiscordDailySummary",
  emailType: EmailType,
): Promise<void> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { OR: [{ [notifyField]: true }, { [discordField]: true }], isGhost: false },
    include: { followedChannels: { include: { channel: true } } },
  });

  let sent = 0;
  for (const user of users) {
    if (user.followedChannels.length === 0) continue;

    const lines: string[] = [];
    for (const follow of user.followedChannels) {
      const count = await prisma.message.count({
        where: { channelId: follow.channelId, createdAt: { gte: since }, isDeleted: false },
      });
      if (count > 0) lines.push(`${follow.channel.name}: ${count} new message${count === 1 ? "" : "s"}`);
    }
    if (lines.length === 0) continue;

    if (user[notifyField] && user.email) {
      await sendTemplatedMail(emailType, user.email, user.username, { summary: lines.join("<br>") });
      sent++;
    }
    if (user[discordField] && user.discordUsername) {
      await sendDiscordDM(user.discordUsername, `Your Exomusica activity summary:\n${lines.join("\n")}`);
    }
  }
  console.log(`${emailType} sent to ${sent} of ${users.length} eligible users.`);
  await prisma.$disconnect();
}
