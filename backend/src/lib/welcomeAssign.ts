import { prisma } from "./prisma.js";
import { createNotification } from "./notify.js";
import { sendTemplatedMail } from "./emailTemplates.js";
import { pickBuddy, welcomeLink, welcomeText } from "./welcomeBuddy.js";

/** The room greetings are said in: the first discussion topic. */
export async function welcomeChannelSlug(): Promise<string | null> {
  const c = await prisma.forumChannel.findFirst({ where: { kind: "DISCUSSION" }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { slug: true } });
  return c?.slug ?? null;
}

/** Pairs a newly approved member with an existing one and tells them (in the app and by email). Best-effort: callers don't wait for it or fail because of it. */
export async function assignWelcomeBuddy(newUser: { id: number; username: string }): Promise<void> {
  if (await prisma.welcomeBuddy.findUnique({ where: { newUserId: newUser.id } })) return;
  const [users, lastMsgs, pendings, channel] = await Promise.all([
    prisma.user.findMany({ where: { id: { not: newUser.id }, isGhost: false, deletedAt: null }, select: { id: true, username: true, email: true, notifyPrivateMessage: true } }),
    prisma.message.groupBy({ by: ["authorId"], _max: { createdAt: true } }),
    prisma.welcomeBuddy.groupBy({ by: ["buddyId"], where: { doneAt: null }, _count: { _all: true } }),
    welcomeChannelSlug(),
  ]);
  const last = new Map(lastMsgs.map((m) => [m.authorId, m._max.createdAt?.getTime() ?? null]));
  const pend = new Map(pendings.map((p) => [p.buddyId, p._count._all]));
  const id = pickBuddy(users.map((u) => ({ id: u.id, pending: pend.get(u.id) ?? 0, lastActiveAt: last.get(u.id) ?? null })), Date.now());
  const buddy = users.find((u) => u.id === id);
  if (!buddy) return;
  await prisma.welcomeBuddy.create({ data: { newUserId: newUser.id, buddyId: buddy.id } });
  await createNotification(buddy.id, "welcome_buddy", `Say hello to ${newUser.username}`, welcomeText(newUser.username), { channelSlug: channel ?? undefined });
  const base = process.env.PUBLIC_URL;
  if (buddy.email && buddy.notifyPrivateMessage && base && channel) {
    await sendTemplatedMail("WELCOME_BUDDY", buddy.email, buddy.username, { newMember: newUser.username, welcomeUrl: welcomeLink(base, channel, newUser.username) });
  }
}
