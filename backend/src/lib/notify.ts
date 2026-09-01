import { prisma } from "./prisma.js";

export async function createNotification(
  userId: number,
  eventKey: string,
  title: string,
  body: string,
  options: { channelSlug?: string; messageId?: number } = {},
): Promise<void> {
  await prisma.notification.create({
    data: { userId, eventKey, title, body, channelSlug: options.channelSlug, messageId: options.messageId },
  });
}
