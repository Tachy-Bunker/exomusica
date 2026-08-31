import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_EMOJI_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/bmp": ".bmp",
  "image/x-ms-bmp": ".bmp",
};
const ALLOWED_EXTENSIONS = new Set([".png", ".bmp"]);

/** Saves one uploaded emoji image to disk. Returns the public URL path
 *  (served by @fastify/static under /uploads) and a filesystem-safe name
 *  derived from the original filename, for use as the emoji's default name. */
export async function saveEmojiFile(
  filename: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ url: string; suggestedName: string }> {
  // Mimetype first, but browsers disagree on what to call a BMP — fall
  // back to the file extension rather than reject a legitimate upload.
  const ext =
    ALLOWED_EMOJI_TYPES[mimeType] ??
    (ALLOWED_EXTENSIONS.has(path.extname(filename).toLowerCase()) ? path.extname(filename).toLowerCase() : null);
  if (!ext) {
    throw new Error(`unsupported image type "${mimeType}" — only PNG and BMP are accepted`);
  }
  const dir = path.join(UPLOADS_DIR, "emojis");
  await mkdir(dir, { recursive: true });

  const diskName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, diskName), buffer);

  const suggestedName = path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 32);

  return { url: `/uploads/emojis/${diskName}`, suggestedName: suggestedName || "emoji" };
}

/** Saves a forum-message attachment for a user, enforcing their 65MB quota
 *  unless explicitly bypassed (the Discord importer bypasses it — a bulk
 *  historical backfill isn't the same thing as live upload behavior, but
 *  storageUsedBytes is still updated for accurate accounting). Returns the
 *  created Attachment row (not yet linked to a message — the caller sets
 *  messageId once the message exists). */
export async function saveMessageAttachment(
  uploaderId: number,
  filename: string,
  mimeType: string,
  buffer: Buffer,
  options: { bypassQuota?: boolean } = {},
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uploaderId } });
  const newTotal = user.storageUsedBytes + BigInt(buffer.length);
  if (!options.bypassQuota && newTotal > user.storageLimitBytes) {
    throw new Error(
      `this attachment would push you over your ${Number(user.storageLimitBytes) / 1024 / 1024}MB storage limit`,
    );
  }

  const dir = path.join(UPLOADS_DIR, "messages");
  await mkdir(dir, { recursive: true });
  const ext = path.extname(filename) || "";
  const diskName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, diskName), buffer);

  const [attachment] = await prisma.$transaction([
    prisma.attachment.create({
      data: {
        uploaderId,
        filename: path.basename(filename),
        mimeType,
        sizeBytes: buffer.length,
        storagePath: `/uploads/messages/${diskName}`,
      },
    }),
    prisma.user.update({ where: { id: uploaderId }, data: { storageUsedBytes: newTotal } }),
  ]);
  return attachment;
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Saves a cover-art or gallery image for an album. No user quota applies —
 *  these are admin-only site assets, same reasoning as emoji images. */
export async function saveAlbumImage(filename: string, mimeType: string, buffer: Buffer): Promise<{ url: string }> {
  const ext =
    ALLOWED_IMAGE_TYPES[mimeType] ??
    ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(path.extname(filename).toLowerCase())
      ? path.extname(filename).toLowerCase()
      : null);
  if (!ext) {
    throw new Error(`unsupported image type "${mimeType}" — PNG, JPEG, WebP, or GIF only`);
  }
  const dir = path.join(UPLOADS_DIR, "albums");
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, diskName), buffer);
  return { url: `/uploads/albums/${diskName}` };
}

export { UPLOADS_DIR };
