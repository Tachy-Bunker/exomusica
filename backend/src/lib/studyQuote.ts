export const MAX_QUOTE_CHARS = 1200;

/** Plain text of a chat message made safe to sit inside a study: mention markup turned into a name-less @, control characters dropped, capped. */
export function cleanQuoteText(v: unknown): string {
  return String(v ?? "").replace(/<[@#&]\d+>/g, "@…").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, "").replace(/\r/g, "").trim().slice(0, MAX_QUOTE_CHARS);
}

const safeUrl = (u: unknown): string | null => (typeof u === "string" && /^https?:\/\/[^\s)<>]{1,300}$/.test(u) ? u : null);
const safeLabel = (s: unknown, fallback: string) => String(s ?? "").replace(/[\[\]()\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || fallback;

/** A markdown quote with a signature line: "> text" per line, then "> — author, [where](link)". Starts with a blank line so it never glues to the text above. */
export function quoteBlock(text: string, by: unknown, where: unknown, href: unknown): string | null {
  const t = cleanQuoteText(text);
  if (!t) return null;
  const lines = t.split("\n").map((l) => `> ${l}`.trimEnd());
  const url = safeUrl(href);
  const who = safeLabel(by, "someone");
  const sig = url ? `> — ${who}, [${safeLabel(where, "chat")}](${url})` : `> — ${who}`;
  return `\n\n${lines.join("\n")}\n${sig}\n`;
}
