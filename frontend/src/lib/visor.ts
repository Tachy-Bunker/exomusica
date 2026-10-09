import type { Doc } from "./letterDoc";

/** Scan Visor helpers: where a note sits on the page, and what a one-line note looks like as a letter. Pure, so they test without a DOM. */
export const NOTE_COLORS = ["#46c28a", "#f5a524", "#3b9dff"] as const;
export const NOTE_MAX = 120;

const hash = (n: number): number => { let h = Math.imul(n + 0x9e3779b9, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; };

/** A note is a one-line letter on the dark sheet: the server keeps it as an ordinary mark. */
export function noteDoc(text: string, color: string = NOTE_COLORS[0]): Doc {
  const v = text.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
  return { bg: "night", items: [{ t: "x", x: 500, y: 350, r: 0, s: v.length > 60 ? 32 : v.length > 30 ? 44 : 60, c: color, k: 0, v }] };
}
/** The words of a note, if the mark is one (a single text line); drawings have none. */
export function noteText(doc: Doc): string | null {
  return doc.items.length === 1 && doc.items[0].t === "x" ? doc.items[0].v : null;
}
/** A click on the page becomes a stored spot: x as a fraction of the page width, y in pixels from the top. */
export function pageSpot(pageX: number, pageY: number, pageWidth: number): { x: number; y: number } {
  const w = Math.max(1, pageWidth);
  return { x: Math.round(Math.min(1, Math.max(0, pageX / w)) * 10_000) / 10_000, y: Math.round(Math.max(0, pageY)) };
}
/** Where a mark is drawn: its own spot, or for marks that were drawn on the sheet (no spot) a stable scatter by id over the first screens. */
export function spotOf(m: { id: number; x?: number | null; y?: number | null }): { left: number; top: number; placed: boolean } {
  if (typeof m.x === "number" && typeof m.y === "number") return { left: m.x * 100, top: m.y, placed: true };
  const left = 8 + (hash(m.id) % 8400) / 100; let top = 150 + (hash(m.id * 7 + 1) % 5200) / 10;
  if (left > 62 && top < 360) top += 230; // the top right of the first screen is where the HUD sits: scattered marks stay clear of it
  return { left, top, placed: false };
}
/** A card or label opens to the left when the spot is in the right third of the page, so it stays on screen. */
export const opensLeft = (leftPercent: number): boolean => leftPercent > 66;
