import "dotenv/config";
import Fastify from "fastify";
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
import { wsRoutes } from "./routes/ws.js";

const app = Fastify({ logger: true });

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
await app.register(wsRoutes);

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
