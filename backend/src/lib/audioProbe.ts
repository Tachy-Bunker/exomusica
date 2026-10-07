import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "./storage.js";
import { parseBuffer } from "music-metadata";

/** Fetches an audio file and reads its duration from embedded metadata.
 *  Returns null on any failure (network error, unparseable format, no
 *  duration in the file's own metadata) rather than throwing - this is
 *  best-effort enrichment, not a required step for adding a track. */
/** Duration from audio bytes we already have (a file that has just been uploaded). */
export async function probeAudioDurationOfBuffer(buffer: Buffer): Promise<number | null> {
  try {
    const metadata = await parseBuffer(buffer);
    const duration = metadata.format.duration;
    return typeof duration === "number" && Number.isFinite(duration) ? Math.round(duration) : null;
  } catch {
    return null;
  }
}

/** Duration of the file at an address: a web address is fetched, a file on this server (/uploads/...) is read from disk, never from outside the uploads folder. */
export async function probeAudioDuration(url: string): Promise<number | null> {
  try {
    let buffer: Buffer;
    if (url.startsWith("/uploads/")) {
      const root = path.resolve(UPLOADS_DIR);
      const file = path.resolve(root, url.slice("/uploads/".length));
      if (!file.startsWith(root + path.sep)) return null;
      buffer = await readFile(file);
    } else {
      const res = await fetch(url);
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    }
    return await probeAudioDurationOfBuffer(buffer);
  } catch (err) {
    console.error(`Failed to probe audio duration for ${url}:`, err);
    return null;
  }
}
