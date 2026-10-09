import { parseBuffer } from "music-metadata";
import { titleFromFilename } from "./trackSearch.js";

export interface AudioTags { title: string | null; artist: string | null; album: string | null; trackNo: number | null; year: number | null; genre: string | null }
export interface RawCommon { title?: unknown; artist?: unknown; album?: unknown; track?: { no?: unknown }; year?: unknown; genre?: unknown }

const text = (v: unknown, max = 200): string | null => (typeof v === "string" && v.replace(/\s+/g, " ").trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** Embedded tags in the shape the site uses: trimmed, bounded, nothing invented. */
export function normalizeTags(c: RawCommon | null | undefined): AudioTags {
  const x = c ?? {};
  return {
    title: text(x.title),
    artist: text(x.artist),
    album: text(x.album),
    trackNo: int(x.track?.no, 1, 999),
    year: int(x.year, 1000, 3000),
    genre: Array.isArray(x.genre) ? text(x.genre[0], 60) : text(x.genre, 60),
  };
}

/** The title to use: the file's own tag, else its file name. */
export const titleFor = (tags: AudioTags, filename: string): string => tags.title ?? titleFromFilename(filename);

export async function probeAudioTags(buffer: Buffer): Promise<AudioTags> {
  try { return normalizeTags((await parseBuffer(buffer, undefined, { duration: false, skipCovers: true })).common); } catch { return normalizeTags(null); }
}
