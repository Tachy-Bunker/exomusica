import { parseBuffer } from "music-metadata";

/** Fetches an audio file and reads its duration from embedded metadata.
 *  Returns null on any failure (network error, unparseable format, no
 *  duration in the file's own metadata) rather than throwing — this is
 *  best-effort enrichment, not a required step for adding a track. */
export async function probeAudioDuration(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const metadata = await parseBuffer(buffer);
    const duration = metadata.format.duration;
    return typeof duration === "number" && Number.isFinite(duration) ? Math.round(duration) : null;
  } catch (err) {
    console.error(`Failed to probe audio duration for ${url}:`, err);
    return null;
  }
}
