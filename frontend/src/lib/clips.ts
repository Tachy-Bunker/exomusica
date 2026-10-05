// A "clip" is a slice of an audio file cited by a study note. It lives inside
// the note's text, so it needs no schema of its own and rides along with the
// note's numbering, placement and renumbering:
//
//   Detail of the second formant sweep {clip:12.5-15.2 /uploads/messages/a.wav img=/uploads/messages/s.png}
//
// img= (optional) is a spectrogram of just that slice, rendered once in the
// author's browser, so readers load a picture instead of decoding audio.

export interface Clip {
  start: number;
  end: number;
  url: string;
  img: string | null;
}

export const CLIP_RE = /\{clip:(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?) (\S+?)(?: img=(\S+?))?\}/;
export const CLIP_RE_GLOBAL = new RegExp(CLIP_RE.source, "g");

const round = (n: number) => Math.round(n * 100) / 100;

export function formatClip(c: Clip): string {
  const start = round(Math.max(0, c.start));
  const end = round(Math.max(start, c.end));
  return `{clip:${start}-${end} ${c.url}${c.img ? ` img=${c.img}` : ""}}`;
}

/** The first clip in a note's text, or null. A note has at most one. */
export function parseClip(text: string): Clip | null {
  const m = text.match(CLIP_RE);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!(end > start)) return null;
  return { start, end, url: m[3], img: m[4] ?? null };
}

/** The note's wording without the clip token - for chips, tooltips, plain-text places. */
export function stripClip(text: string): string {
  return text.replace(CLIP_RE_GLOBAL, "").replace(/\s{2,}/g, " ").trim();
}

/** 12.5 -> "0:12.5", 5 -> "0:05", 75 -> "1:15", 3725.25 -> "1:02:05.25" */
export function formatTime(seconds: number): string {
  const total = Math.round(Math.max(0, seconds) * 100) / 100; // round first, so 59.999 becomes 1:00, not 0:60
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const [whole, frac] = (total - h * 3600 - m * 60).toFixed(2).replace(/\.?0+$/, "").split(".");
  const ss = whole.padStart(2, "0") + (frac ? `.${frac}` : "");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
