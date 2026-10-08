// Finding and adding tracks for an album. Pure, so it is tested without a database.

export type TrackFormat = "OPUS" | "MP3" | "FLAC" | "WAV" | "OGG" | "M4A" | "AAC";
export const TRACK_FORMATS: Record<string, TrackFormat> = { ".mp3": "MP3", ".wav": "WAV", ".ogg": "OGG", ".oga": "OGG", ".opus": "OPUS", ".m4a": "M4A", ".aac": "AAC", ".flac": "FLAC" };

const extOf = (name: string) => { const i = name.lastIndexOf("."); return i === -1 ? "" : name.slice(i).toLowerCase(); };
/** What a file is, from its name; MP3 when it can't tell. */
export const formatFromName = (name: string): TrackFormat => TRACK_FORMATS[extOf(name.split("?")[0])] ?? "MP3";
/** A readable title from a file name: no extension, spaces instead of underscores. */
export const titleFromFilename = (filename: string): string => filename.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled";

export interface TrackHit { source: "album" | "upload" | "community"; trackId?: number; communityTrackId?: number; attachmentId?: number; title: string; fileUrl: string; format: TrackFormat; durationSeconds: number | null; detail: string }
export const MAX_TRACK_HITS = 25;

export function shapeTrackHits(found: {
  tracks: { id?: number; title: string; fileUrl: string; format: string; durationSeconds: number | null; album: { title: string } }[];
  attachments: { id?: number; filename: string; storagePath: string; mimeType: string }[];
  community: { id?: number; title: string; externalUrl: string | null; attachment: { storagePath: string; filename: string } | null; album: { title: string } }[];
}): TrackHit[] {
  const out: TrackHit[] = [];
  const seen = new Set<string>();
  const add = (h: TrackHit) => { if (h.fileUrl && !seen.has(h.fileUrl) && out.length < MAX_TRACK_HITS) { seen.add(h.fileUrl); out.push(h); } };
  for (const t of found.tracks) add({ source: "album", trackId: t.id, title: t.title, fileUrl: t.fileUrl, format: (t.format in { OPUS: 1, MP3: 1, FLAC: 1, WAV: 1, OGG: 1, M4A: 1, AAC: 1 } ? t.format : formatFromName(t.fileUrl)) as TrackFormat, durationSeconds: t.durationSeconds, detail: `On the album "${t.album.title}"` });
  for (const c of found.community) {
    const url = c.attachment?.storagePath ?? c.externalUrl ?? "";
    add({ source: "community", communityTrackId: c.id, title: c.title, fileUrl: url, format: formatFromName(c.attachment?.filename ?? url), durationSeconds: null, detail: `Community track on "${c.album.title}"` });
  }
  for (const a of found.attachments) add({ source: "upload", attachmentId: a.id, title: titleFromFilename(a.filename), fileUrl: a.storagePath, format: formatFromName(a.filename), durationSeconds: null, detail: `Uploaded file ${a.filename}` });
  return out;
}
