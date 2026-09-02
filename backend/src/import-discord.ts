import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import {
  type DiscordRow,
  type AttachmentResolver,
  importDiscordRows,
} from "./lib/discordImport.js";

const prisma = new PrismaClient();

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

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const csvPath = get("--csv");
  const channelSlug = get("--channel");
  const mediaDir = get("--media-dir");
  const archiveOrgPrefix = get("--archive-org-prefix");
  if (!csvPath || !channelSlug) {
    console.error(
      "Usage: node dist/import-discord.js --csv <path> --channel <slug> [--media-dir <path> | --archive-org-prefix <url>]",
    );
    process.exit(1);
  }
  return { csvPath, channelSlug, mediaDir, archiveOrgPrefix };
}

async function main() {
  const { csvPath, channelSlug, mediaDir, archiveOrgPrefix } = parseArgs();

  const channel = await prisma.forumChannel.findUnique({ where: { slug: channelSlug } });
  if (!channel) {
    console.error(`No channel with slug "${channelSlug}" — create it first (branch or admin discussion topic).`);
    process.exit(1);
  }

  const rows: DiscordRow[] = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true });

  const attachments: AttachmentResolver = archiveOrgPrefix
    ? { kind: "archiveOrg", urlPrefix: archiveOrgPrefix }
    : mediaDir
      ? { kind: "local", index: indexMediaDir(mediaDir) }
      : { kind: "none" };

  const summary = await importDiscordRows(prisma, channel.id, rows, attachments);

  console.log("\nImport complete.");
  console.log(`  Messages imported:    ${summary.imported}`);
  console.log(`  Skipped (system):     ${summary.skippedSystem}`);
  console.log(`  Skipped (duplicate):  ${summary.skippedDuplicate}`);
  console.log(`  Attachments resolved: ${summary.attachmentsResolved}`);
  console.log(`  Attachments missing:  ${summary.attachmentsMissing}`);
  console.log("\nNot imported from this format (not present in CSV export): replies, reactions.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
