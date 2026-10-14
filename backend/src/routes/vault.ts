import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getMilestones } from "../lib/milestones.js";
import { PUBLIC_CHANNEL_FILTER } from "../lib/publicChannels.js";
import { buildVault, VAULT_MAX, type VaultEntry } from "../lib/vault.js";

let cache: { at: number; entries: VaultEntry[] } | null = null;

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    if (!(await getMilestones()).find((m) => m.key === "m-founders")?.reached) return { locked: true, entries: [] };
    if (!cache || Date.now() - cache.at > 600_000) {
      const rows = await prisma.message.findMany({
        where: { isDeleted: false, deletedAt: null, importedFrom: { startsWith: "discord:" }, channel: PUBLIC_CHANNEL_FILTER },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: VAULT_MAX * 3, // some are only files or links: skip them without a second query
        select: { id: true, createdAt: true, contentRaw: true, author: { select: { username: true } }, channel: { select: { name: true, branchId: true, branch: { select: { visibility: true } } } } },
      });
      cache = { at: Date.now(), entries: buildVault(rows) };
    }
    return { locked: false, entries: cache.entries };
  });
}
