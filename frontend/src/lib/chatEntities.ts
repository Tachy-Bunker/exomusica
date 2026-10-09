import { focusOf, freqOf, nearestFreq, peekOf, searchEntities, type Entity, type EntityType } from "./atlas";
import { chatLinkText } from "./chatInsert";

/** What the person is in the middle of typing before the cursor: `#words` (find a thing by name) or `~7.156` (a thing by frequency). */
export interface EntityTrigger { kind: "name" | "freq"; query: string; start: number }

export function entityTrigger(value: string, cursor: number): EntityTrigger | null {
  const before = value.slice(0, cursor);
  const f = /(?:^|\s)~(\d{1,2}(?:[.,]\d{0,3})?)$/.exec(before);
  if (f) return { kind: "freq", query: f[1], start: cursor - f[0].length + (f[0][0] === "~" ? 0 : 1) };
  const n = /(?:^|\s)#([^\s#]{1,40}(?: [^\s#]{1,40})?)$/.exec(before); // up to two words, so "beating tones" works
  if (n && !/^\d+$/.test(n[1])) return { kind: "name", query: n[1], start: cursor - n[0].length + (n[0][0] === "#" ? 0 : 1) };
  return null;
}

export function entityHits(index: Entity[], t: EntityTrigger, limit = 6): Entity[] {
  if (t.kind === "freq") {
    const f = Number(t.query.replace(",", "."));
    return Number.isFinite(f) && t.query.length >= 2 ? nearestFreq(index, f, limit).map((x) => x.e) : [];
  }
  return t.query.length >= 1 ? searchEntities(index, t.query, limit) : [];
}

/** The text that goes into the message for a picked thing. */
export const entityMarkdown = (e: Entity): string => chatLinkText(e.title, peekOf(e).href);

/** If this in-site address is a thing in the Atlas, which one, and on what frequency (for drawing it as a chip). */
export function entityOfPath(path: string): { type: EntityType; id: string; freq: number } | null {
  const q = path.indexOf("?");
  const f = focusOf(q < 0 ? path : path.slice(0, q), q < 0 ? "" : path.slice(q));
  return f ? { ...f, freq: freqOf(f.type, f.id) } : null;
}
