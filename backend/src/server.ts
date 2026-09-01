import "dotenv/config";
import Fastify from "fastify";

// Without this, an uncaught error in any fire-and-forget background task
// (a background email, a notification insert, anything not directly
// awaited in a request handler) crashes the entire process by Node's
// default behavior — taking down every other in-flight request with it.
// Individual background calls should still have their own .catch(), but
// this is the safety net for anything that doesn't.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (process kept alive):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (process kept alive):", err);
});

import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { prisma } from "./lib/prisma.js";
import { UPLOADS_DIR } from "./lib/storage.js";
import { authRoutes } from "./routes/auth.js";
import { joinRoutes } from "./routes/join.js";
import { branchRoutes } from "./routes/branches.js";
import { channelRoutes } from "./routes/channels.js";
import { messageRoutes } from "./routes/messages.js";
import { reactionRoutes } from "./routes/reactions.js";
import { bookmarkRoutes } from "./routes/bookmarks.js";
import { accountRoutes } from "./routes/account.js";
import { collaboratorRoutes } from "./routes/collaborators.js";
import { albumRoutes } from "./routes/albums.js";
import { wikiRoutes } from "./routes/wiki.js";
import { blogRoutes } from "./routes/blog.js";
import { pmRoutes } from "./routes/pms.js";
import { emojiRoutes } from "./routes/emojis.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { adminEmailRoutes } from "./routes/adminEmail.js";
import { auditLogRoutes } from "./routes/auditLog.js";
import { aboutRoutes } from "./routes/about.js";
import { mediaRoutes } from "./routes/media.js";
import { fontRoutes } from "./routes/fonts.js";
import { notificationSoundRoutes } from "./routes/notificationSounds.js";
import { notificationRoutes } from "./routes/notifications.js";
import { presenceRoutes } from "./routes/presence.js";
import { siteSettingsRoutes } from "./routes/siteSettings.js";
import { wsRoutes } from "./routes/ws.js";

// Fastify's own default body limit is 1MB, applied before multipart even
// parses anything — this was the real ceiling blocking larger uploads
// (cover art, gallery images, message attachments), not anything in
// multipart's own config. Raised for the whole app, not just admin routes,
// since Fastify's bodyLimit isn't naturally scoped per-route by auth.
const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

await app.register(cors, { origin: true });
await app.register(websocketPlugin);
await app.register(multipart);
await app.register(fastifyStatic, { root: UPLOADS_DIR, prefix: "/uploads/" });

app.get("/health", async () => {
  const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT now()`;
  return { status: "ok", dbTime: rows[0]?.now };
});

await app.register(authRoutes);
await app.register(joinRoutes);
await app.register(branchRoutes);
await app.register(channelRoutes);
await app.register(messageRoutes);
await app.register(reactionRoutes);
await app.register(bookmarkRoutes);
await app.register(accountRoutes);
await app.register(collaboratorRoutes);
await app.register(albumRoutes);
await app.register(wikiRoutes);
await app.register(blogRoutes);
await app.register(pmRoutes);
await app.register(emojiRoutes);
await app.register(attachmentRoutes);
await app.register(adminEmailRoutes);
await app.register(auditLogRoutes);
await app.register(aboutRoutes);
await app.register(mediaRoutes);
await app.register(fontRoutes);
await app.register(notificationSoundRoutes);
await app.register(notificationRoutes);
await app.register(presenceRoutes);
await app.register(siteSettingsRoutes);
await app.register(wsRoutes);

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
