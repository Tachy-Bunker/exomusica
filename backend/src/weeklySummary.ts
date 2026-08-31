import { PrismaClient } from "@prisma/client";
import { sendMail } from "./lib/mailer.js";

const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { notifyWeeklySummary: true, isGhost: false },
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

    await sendMail(user.email, "Your weekly Exomusica activity", lines.join("\n"));
    sent++;
  }
  console.log(`Weekly summary sent to ${sent} of ${users.length} eligible users.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
