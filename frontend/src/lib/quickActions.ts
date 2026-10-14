/** The four quick actions on a message. Letters never move (muscle memory); the order of the fan follows what you use. No DOM here. */
export type QuickId = "reply" | "react" | "quote" | "pin";
export interface QuickAction { id: QuickId; label: string; glyph: string; key: string; code: string }
export const QUICK: readonly QuickAction[] = [
  { id: "reply", label: "Reply", glyph: "↩", key: "R", code: "KeyR" },
  { id: "react", label: "React", glyph: "☺", key: "E", code: "KeyE" },
  { id: "quote", label: "Quote", glyph: "❝", key: "Q", code: "KeyQ" },
  { id: "pin", label: "Pin", glyph: "⚑", key: "P", code: "KeyP" },
];
export type Counts = Partial<Record<QuickId, number>>;
const STORE = "exomusica_quick";

/** Most used first; ties keep the default order. */
export function orderByUse(counts: Counts): QuickAction[] {
  return QUICK.map((a, i) => ({ a, i, n: counts[a.id] ?? 0 })).sort((x, y) => y.n - x.n || x.i - y.i).map((x) => x.a);
}
/** Count one use. When the total passes 60 every count is halved, so the fan follows what you do lately, not what you did a year ago. */
export function bump(counts: Counts, id: QuickId): Counts {
  const next: Counts = { ...counts, [id]: (counts[id] ?? 0) + 1 };
  const total = QUICK.reduce((s, a) => s + (next[a.id] ?? 0), 0);
  if (total > 60) for (const a of QUICK) next[a.id] = Math.floor((next[a.id] ?? 0) / 2);
  return next;
}
export function loadCounts(): Counts {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, unknown>;
    const out: Counts = {};
    for (const a of QUICK) { const n = raw[a.id]; if (typeof n === "number" && Number.isFinite(n) && n > 0) out[a.id] = Math.min(1000, Math.floor(n)); }
    return out;
  } catch { return {}; }
}
export function saveCounts(c: Counts): void { try { localStorage.setItem(STORE, JSON.stringify(c)); } catch { /* storage blocked */ } }

/** What goes into the box when you quote: "> name: text", one line, no nested quotes, at most 240 characters. */
export function quoteText(author: string, raw: string): string {
  const body = raw.replace(/^>.*$/gm, "").replace(/\s+/g, " ").trim();
  const clipped = body.length > 240 ? body.slice(0, 239).trimEnd() + "…" : body;
  return `> ${author}: ${clipped || "(no text)"}\n`;
}
/** Which action a key belongs to, by physical key (so it works on any layout). */
export const actionForCode = (code: string): QuickAction | undefined => QUICK.find((a) => a.code === code);
