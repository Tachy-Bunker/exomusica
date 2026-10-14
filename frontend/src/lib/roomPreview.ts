// What a room's chat terminal shows on its screen without being opened: the last few things said. Pure.
export interface PreviewMsg { authorUsername: string; contentRaw: string }
export const PREVIEW_LINES = 3, PREVIEW_CHARS = 24;
/** One short line per message: markup, mentions, emoji codes and links shortened to plain words, cut to fit a small screen. */
export function previewLine(m: PreviewMsg): string {
  const t = String(m.contentRaw ?? "").replace(/<@\d+>/g, "@").replace(/<a?:\w+:\d+>/g, "·").replace(/https?:\/\/\S+/g, "link").replace(/[*_`~>|#]+/g, "").replace(/\s+/g, " ").trim();
  const s = `${m.authorUsername}: ${t || "…"}`;
  return s.length > PREVIEW_CHARS ? s.slice(0, PREVIEW_CHARS - 1).trimEnd() + "…" : s;
}
/** The newest messages (the list is oldest first), newest at the bottom; a quiet room says so. */
export function previewLines(msgs: unknown): string[] {
  if (!Array.isArray(msgs)) return [];
  const ok = (msgs as PreviewMsg[]).filter((m) => m && typeof m.authorUsername === "string");
  return ok.length ? ok.slice(-PREVIEW_LINES).map(previewLine) : ["(quiet in here)"];
}
