/** Letters: a small drawn document (ink, placed and curved text, stamps) on a fixed canvas. Pure, so the limits are tested without a database. */

export const W = 1000, H = 700;
export const PAPERS = ["paper", "night", "ink", "grid"] as const;
export const COLORS = ["#1b1b1f", "#f4efe3", "#e5484d", "#f5a524", "#3b9dff", "#46c28a"] as const;
export const STAMPS = ["cq", "73", "qsl", "tx", "star", "wave", "eye", "key"] as const;
export const MAX_ITEMS = 150, MAX_POINTS = 6000, MAX_STROKE = 1200, MAX_TEXT = 120, MAX_BYTES = 120_000;

export type Item =
  | { t: "s"; c: string; w: number; p: number[] }
  | { t: "x"; x: number; y: number; r: number; s: number; c: string; k: number; v: string }
  | { t: "m"; x: number; y: number; r: number; s: number; c: string; g: string };
export interface Doc { bg: string; items: Item[] }

const num = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const color = (v: unknown): string => ((COLORS as readonly string[]).includes(String(v)) ? String(v) : COLORS[0]);

/** Whatever arrives is rebuilt from known fields and clamped; nothing else is ever stored or rendered. */
export function cleanDoc(raw: unknown): { ok: true; doc: Doc } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "The letter is empty." };
  const r = raw as { bg?: unknown; items?: unknown };
  if (!Array.isArray(r.items)) return { ok: false, error: "The letter is empty." };
  if (r.items.length > MAX_ITEMS) return { ok: false, error: `Too many marks on one page (${MAX_ITEMS} at most).` };
  const items: Item[] = [];
  let points = 0;
  for (const it of r.items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (o.t === "s") {
      const p = Array.isArray(o.p) ? o.p : [];
      const flat: number[] = [];
      for (let i = 0; i + 1 < Math.min(p.length, MAX_STROKE); i += 2) flat.push(Math.round(num(p[i], 0, W, 0)), Math.round(num(p[i + 1], 0, H, 0)));
      if (flat.length < 2) continue;
      points += flat.length / 2;
      items.push({ t: "s", c: color(o.c), w: Math.round(num(o.w, 1, 14, 3)), p: flat });
    } else if (o.t === "x") {
      const v = String(o.v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, MAX_TEXT);
      if (!v) continue;
      items.push({ t: "x", x: Math.round(num(o.x, 0, W, 500)), y: Math.round(num(o.y, 0, H, 350)), r: Math.round(num(o.r, -180, 180, 0)), s: Math.round(num(o.s, 10, 120, 32)), c: color(o.c), k: Math.round(num(o.k, -100, 100, 0)), v });
    } else if (o.t === "m") {
      const g = String(o.g);
      if (!(STAMPS as readonly string[]).includes(g)) continue;
      items.push({ t: "m", x: Math.round(num(o.x, 0, W, 500)), y: Math.round(num(o.y, 0, H, 350)), r: Math.round(num(o.r, -180, 180, 0)), s: Math.round(num(o.s, 20, 220, 80)), c: color(o.c), g });
    }
  }
  if (points > MAX_POINTS) return { ok: false, error: "That is a lot of ink. Simplify a little." };
  if (items.length === 0) return { ok: false, error: "The letter is empty." };
  const doc: Doc = { bg: (PAPERS as readonly string[]).includes(String(r.bg)) ? String(r.bg) : "paper", items };
  if (JSON.stringify(doc).length > MAX_BYTES) return { ok: false, error: "That letter is too big. Simplify a little." };
  return { ok: true, doc };
}

/** Slow post: held until deliverAt. Hours are clamped to 0-72. */
export const deliverAtFor = (hours: unknown, now = new Date()): Date => new Date(now.getTime() + Math.round(num(hours, 0, 72, 0)) * 3_600_000);

/** Marks left on a place fade: 1-90 days, default 30. */
export const expiryFor = (days: unknown, now = new Date()): Date => new Date(now.getTime() + Math.round(num(days, 1, 90, 30)) * 86_400_000);

export const LIMITS = { toUserPerDay: 10, marksPerDay: 5, marksPerPlace: 20 };
