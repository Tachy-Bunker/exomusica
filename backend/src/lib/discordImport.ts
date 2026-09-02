import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { toDayKey } from "./dayKey.js";
import { saveMessageAttachment } from "./storage.js";

export interface DiscordRow {
  AuthorID: string;
  Author: string;
  Date: string;
  Content: string;
  Attachments: string;
  Reactions: string;
}

export function parseDiscordTimestamp(raw: string): Date {
  const normalized = raw.replace(/\.(\d{3})\d*(?=[+-]\d{2}:\d{2}$|Z$)/, ".$1");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`could not parse timestamp: "${raw}"`);
  return date;
}

export const SYSTEM_MESSAGE_PATTERNS = [
  /^Pinned a message\.$/,
  /^Started a call.*$/i,
  /joined the server\.$/,
  /^Changed the channel name.*$/i,
  /^Changed the channel icon.*$/i,
];

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

export function guessMimeType(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

export async function findOrCreateGhostUser(prisma: PrismaClient, discordId: string, displayName: string) {
  const existing = await prisma.user.findUnique({ where: { discordId } });
  if (existing) return existing;

  let username =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "_")
      .slice(0, 32) || `discord_${discordId.slice(-6)}`;
  let suffix = 1;
  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${username}_${suffix++}`;
  }

  return prisma.user.create({
    data: { username, isGhost: true, ghostReason: "DISCORD_IMPORT", claimToken: randomUUID(), discordId },
  });
}

export interface ImportSummary {
  imported: number;
  skippedSystem: number;
  skippedDuplicate: number;
  attachmentsResolved: number;
  attachmentsMissing: number;
}

export type AttachmentResolver =
  | { kind: "local"; index: Map<string, string> }
  | { kind: "archiveOrg"; urlPrefix: string }
  | { kind: "none" };

export async function importDiscordRows(
  prisma: PrismaClient,
  channelId: number,
  rows: DiscordRow[],
  attachments: AttachmentResolver,
): Promise<ImportSummary> {
  const summary: ImportSummary = { imported: 0, skippedSystem: 0, skippedDuplicate: 0, attachmentsResolved: 0, attachmentsMissing: 0 };

  for (const row of rows) {
    if (SYSTEM_MESSAGE_PATTERNS.some((p) => p.test(row.Content.trim()))) {
      summary.skippedSystem++;
      continue;
    }

    const author = await findOrCreateGhostUser(prisma, row.AuthorID, row.Author);
    const createdAt = parseDiscordTimestamp(row.Date);
    const dayKey = toDayKey(createdAt);
    const importedFrom = `discord:${row.AuthorID}:${createdAt.toISOString()}`;

    const duplicate = await prisma.message.findUnique({
      where: { channelId_importedFrom: { channelId, importedFrom } },
    });
    if (duplicate) {
      summary.skippedDuplicate++;
      continue;
    }

    const message = await prisma.message.create({
      data: { channelId, authorId: author.id, createdAt, dayKey, contentRaw: row.Content, importedFrom },
    });

    if (row.Attachments && attachments.kind !== "none") {
      for (const rawPath of row.Attachments.split(",").map((s) => s.trim()).filter(Boolean)) {
        const basename = path.basename(rawPath.replace(/\\/g, "/"));
        if (attachments.kind === "archiveOrg") {
          const url = attachments.urlPrefix.replace(/\/$/, "") + "/" + encodeURIComponent(basename);
          await prisma.attachment.create({
            data: {
              uploaderId: author.id,
              filename: basename,
              mimeType: guessMimeType(basename),
              sizeBytes: 0n,
              storagePath: url,
              messageId: message.id,
            },
          });
          summary.attachmentsResolved++;
        } else if (attachments.kind === "local") {
          const found = attachments.index.get(basename);
          if (!found) {
            summary.attachmentsMissing++;
            continue;
          }
          const { readFileSync } = await import("node:fs");
          const buffer = readFileSync(found);
          const attachment = await saveMessageAttachment(author.id, basename, guessMimeType(basename), buffer, { bypassQuota: true });
          await prisma.attachment.update({ where: { id: attachment.id }, data: { messageId: message.id } });
          summary.attachmentsResolved++;
        }
      }
    }

    summary.imported++;
  }

  return summary;
}
