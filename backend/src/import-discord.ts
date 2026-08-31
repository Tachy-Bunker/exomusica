import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { toDayKey } from "./lib/dayKey.js";
import { saveMessageAttachment } from "./lib/storage.js";

const prisma = new PrismaClient();

interface DiscordRow {
  AuthorID: string;
  Author: string;
  Date: string;
  Content: string;
  Attachments: string;
  Reactions: string;
}

// .NET-style export timestamps can carry 7 fractional-second digits
// ("ticks"). JS's Date parser expects 3 (milliseconds) — truncate before
// parsing rather than trust the runtime to handle the extra precision.
function parseDiscordTimestamp(raw: string): Date {
  const normalized = raw.replace(/\.(\d{3})\d*(?=[+-]\d{2}:\d{2}$|Z$)/, ".$1");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`could not parse timestamp: "${raw}"`);
  return date;
}

// Best-effort, not exhaustive — DiscordChatExporter renders system events as
// plain sentences with no distinguishing marker in CSV mode. Anything not
// caught here imports as a normal message; review the summary after.
const SYSTEM_MESSAGE_PATTERNS = [
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

function guessMimeType(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const csvPath = get("--csv");
  const channelSlug = get("--channel");
  const mediaDir = get("--media-dir");
  if (!csvPath || !channelSlug) {
    console.error("Usage: node dist/import-discord.js --csv <path> --channel <slug> [--media-dir <path>]");
    process.exit(1);
  }
  return { csvPath, channelSlug, mediaDir };
}

/** Indexes every file under mediaDir by basename, once, so per-row lookups
 *  are O(1) instead of re-walking the tree per attachment. The CSV's own
 *  paths are absolute Windows paths from wherever the export was made —
 *  meaningless here — so only the filename itself is used to relocate it
 *  under mediaDir (which is expected to be that whole backup folder,
 *  copied over with its subfolders intact). */
function indexMediaDir(mediaDir: string): Map<string, string> {
  const index = new Map<string, string>();
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else index.set(entry, full);
    }
  }
  walk(mediaDir);
  return index;
}

async function findOrCreateGhostUser(discordId: string, displayName: string) {
  const existing = await prisma.user.findUnique({ where: { discordId } });
  if (existing) return existing;

  let username = displayName
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .slice(0, 32) || `discord_${discordId.slice(-6)}`;
  let suffix = 1;
  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${username}_${suffix++}`;
  }

  return prisma.user.create({
    data: {
      username,
      isGhost: true,
      ghostReason: "DISCORD_IMPORT",
      claimToken: randomUUID(),
      discordId,
    },
  });
}

async function main() {
  const { csvPath, channelSlug, mediaDir } = parseArgs();

  const channel = await prisma.forumChannel.findUnique({ where: { slug: channelSlug } });
  if (!channel) {
    console.error(`No channel with slug "${channelSlug}" — create it first (branch or admin discussion topic).`);
    process.exit(1);
  }

  const rows: DiscordRow[] = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true });
  const mediaIndex = mediaDir ? indexMediaDir(mediaDir) : null;

  let imported = 0;
  let skippedSystem = 0;
  let skippedDuplicate = 0;
  let attachmentsCopied = 0;
  let attachmentsMissing = 0;

  for (const row of rows) {
    if (SYSTEM_MESSAGE_PATTERNS.some((p) => p.test(row.Content.trim()))) {
      skippedSystem++;
      continue;
    }

    const author = await findOrCreateGhostUser(row.AuthorID, row.Author);
    const createdAt = parseDiscordTimestamp(row.Date);
    const dayKey = toDayKey(createdAt);

    // No message-id column in this export format, so dedup on the natural
    // key instead — safe to re-run the same CSV without doubling messages.
    const duplicate = await prisma.message.findFirst({
      where: { channelId: channel.id, authorId: author.id, createdAt, contentRaw: row.Content },
    });
    if (duplicate) {
      skippedDuplicate++;
      continue;
    }

    const message = await prisma.message.create({
      data: {
        channelId: channel.id,
        authorId: author.id,
        createdAt,
        dayKey,
        contentRaw: row.Content,
        importedFrom: `discord:${row.AuthorID}:${createdAt.toISOString()}`,
      },
    });

    if (row.Attachments && mediaIndex) {
      for (const rawPath of row.Attachments.split(",").map((s) => s.trim()).filter(Boolean)) {
        const basename = path.basename(rawPath.replace(/\\/g, "/"));
        const found = mediaIndex.get(basename);
        if (!found) {
          attachmentsMissing++;
          console.warn(`  attachment not found under media-dir: ${basename}`);
          continue;
        }
        const buffer = readFileSync(found);
        // Bulk historical backfill, not live upload — quota is bypassed,
        // storageUsedBytes is still updated for accurate accounting.
        const attachment = await saveMessageAttachment(author.id, basename, guessMimeType(basename), buffer, {
          bypassQuota: true,
        });
        await prisma.attachment.update({ where: { id: attachment.id }, data: { messageId: message.id } });
        attachmentsCopied++;
      }
    } else if (row.Attachments && !mediaIndex) {
      console.warn(`  message has attachments but no --media-dir given — skipped: ${row.Attachments}`);
    }

    imported++;
    if (imported % 50 === 0) console.log(`...${imported} messages imported so far`);
  }

  console.log("\nImport complete.");
  console.log(`  Messages imported:   ${imported}`);
  console.log(`  Skipped (system):    ${skippedSystem}`);
  console.log(`  Skipped (duplicate): ${skippedDuplicate}`);
  console.log(`  Attachments copied:  ${attachmentsCopied}`);
  console.log(`  Attachments missing: ${attachmentsMissing}`);
  console.log("\nNot imported from this format (not present in CSV export): replies, reactions.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
