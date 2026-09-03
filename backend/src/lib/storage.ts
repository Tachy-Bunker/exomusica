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
  "image/bmp": ".bmp",
  "image/x-ms-bmp": ".bmp", // browsers are inconsistent about which of these two they send for BMP
  "image/svg+xml": ".svg",
};

/** Saves a general site image (album cover/gallery, About-page entries).
 *  No user quota applies — these are admin-only site assets, same
 *  reasoning as emoji images. `subfolder` just keeps uploads/ organized. */
export async function saveSiteImage(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  subfolder: "albums" | "about" | "guide" | "avatars" | "moire" | "og-images",
): Promise<{ url: string }> {
  const ext =
    ALLOWED_IMAGE_TYPES[mimeType] ??
    ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(path.extname(filename).toLowerCase())
      ? path.extname(filename).toLowerCase()
      : null);
  if (!ext) {
    throw new Error(`unsupported image type "${mimeType}" — PNG, JPEG, WebP, or GIF only`);
  }
  const dir = path.join(UPLOADS_DIR, subfolder);
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, diskName), buffer);
  return { url: `/uploads/${subfolder}/${diskName}` };
}

const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "text/plain": ".txt",
};

/** General-purpose media upload for embedding in wiki pages, blog posts,
 *  and anywhere else that isn't a forum message attachment or an
 *  album/emoji/about image specifically. No user quota — admin-only. */
export async function saveMediaFile(filename: string, mimeType: string, buffer: Buffer): Promise<{ url: string; mimeType: string }> {
  const ext = ALLOWED_MEDIA_TYPES[mimeType] ?? path.extname(filename).toLowerCase();
  if (!ext) {
    throw new Error(`unsupported file type "${mimeType}"`);
  }
  const dir = path.join(UPLOADS_DIR, "media");
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, diskName), buffer);
  return { url: `/uploads/media/${diskName}`, mimeType };
}

const ALLOWED_FONT_TYPES: Record<string, string> = {
  "font/otf": "opentype",
  "font/ttf": "truetype",
  "font/woff": "woff",
  "font/woff2": "woff2",
  "application/vnd.ms-opentype": "opentype",
  "application/x-font-opentype": "opentype",
  "application/x-font-ttf": "truetype",
  "application/octet-stream": "", // browsers often send this for font files; fall back to extension
};

const FONT_EXT_FORMAT: Record<string, string> = {
  ".otf": "opentype",
  ".ttf": "truetype",
  ".woff": "woff",
  ".woff2": "woff2",
};

/** Saves an admin-uploaded font file. Returns the public URL and the CSS
 *  @font-face format string it needs (not guessable from mimetype alone —
 *  browsers are inconsistent about what mimetype they send for fonts, so
 *  the file extension is the more reliable signal here). */
export async function saveFontFile(filename: string, mimeType: string, buffer: Buffer): Promise<{ url: string; format: string }> {
  const ext = path.extname(filename).toLowerCase();
  const format = FONT_EXT_FORMAT[ext] ?? ALLOWED_FONT_TYPES[mimeType];
  if (!format) {
    throw new Error(`unsupported font type — use OTF, TTF, WOFF, or WOFF2`);
  }
  const dir = path.join(UPLOADS_DIR, "fonts");
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}${ext || ".font"}`;
  await writeFile(path.join(dir, diskName), buffer);
  return { url: `/uploads/fonts/${diskName}`, format };
}

const ALLOWED_SOUND_TYPES: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
};

/** Saves an admin-uploaded notification sound clip. */
export async function saveSoundFile(filename: string, mimeType: string, buffer: Buffer): Promise<{ url: string }> {
  const ext = ALLOWED_SOUND_TYPES[mimeType] ?? path.extname(filename).toLowerCase();
  if (![".mp3", ".wav", ".ogg"].includes(ext)) {
    throw new Error("unsupported sound type — use MP3, WAV, or OGG");
  }
  const dir = path.join(UPLOADS_DIR, "sounds");
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, diskName), buffer);
  return { url: `/uploads/sounds/${diskName}` };
}

export { UPLOADS_DIR };

const ALLOWED_GALLERY_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

/** Album gallery items specifically can be images OR short video clips
 *  (MOV/MP4) — cover art stays image-only via saveSiteImage above. */
export async function saveGalleryFile(filename: string, mimeType: string, buffer: Buffer): Promise<{ url: string; kind: "image" | "video" }> {
  const videoExt = ALLOWED_GALLERY_VIDEO_TYPES[mimeType] ?? (path.extname(filename).toLowerCase() === ".mov" || path.extname(filename).toLowerCase() === ".mp4" ? path.extname(filename).toLowerCase() : null);
  if (videoExt) {
    const dir = path.join(UPLOADS_DIR, "albums");
    await mkdir(dir, { recursive: true });
    const diskName = `${randomUUID()}${videoExt}`;
    await writeFile(path.join(dir, diskName), buffer);
    return { url: `/uploads/albums/${diskName}`, kind: "video" };
  }
  const { url } = await saveSiteImage(filename, mimeType, buffer, "albums");
  return { url, kind: "image" };
}
