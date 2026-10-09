/** A letter is a small drawing: ink, placed text, stamps, on a fixed 1000x700 sheet. The server rebuilds and clamps every field; this is the shape it keeps. */
export const W = 1000, H = 700;
export const PAPERS = ["paper", "night", "ink", "grid"] as const;
export const COLORS = ["#1b1b1f", "#f4efe3", "#e5484d", "#f5a524", "#3b9dff", "#46c28a"] as const;
export const STAMPS = ["cq", "73", "qsl", "tx", "star", "wave", "eye", "key"] as const;
export const STAMP_NAME: Record<string, string> = { cq: "CQ", "73": "73", qsl: "QSL", tx: "TX", star: "Star", wave: "Wave", eye: "Eye", key: "Key" };
export const PAPER_BG: Record<string, string> = { paper: "#f4efe3", night: "#14151c", ink: "#0b0b0d", grid: "#f4efe3" };
export type Item =
  | { t: "s"; c: string; w: number; p: number[] }
  | { t: "x"; x: number; y: number; r: number; s: number; c: string; k: number; v: string }
  | { t: "m"; x: number; y: number; r: number; s: number; c: string; g: string };
export interface Doc { bg: string; items: Item[] }

/** Flat [x,y,...] to a smooth path: quadratic curves through the midpoints, cheap to draw and to store. */
export function strokePath(p: number[]): string {
  if (p.length < 4) return `M${p[0]} ${p[1]}h0.1`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
}

/** The arc that curved text rides on: `k` in -100..100 bends it up or down. */
export function arcPath(len: number, k: number): string {
  const sag = (k / 100) * len * 0.45;
  return `M${-len / 2} 0Q0 ${-2 * sag} ${len / 2} 0`;
}
export const textLen = (v: string, s: number): number => Math.max(s, v.length * s * 0.58);

/** Keeps a drawn stroke under the server's point limit while holding its shape (every nth point, always the last). */
export function thin(p: number[], max = 600): number[] {
  const n = p.length / 2;
  if (n <= max) return p;
  const step = Math.ceil(n / max), out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(p[i * 2], p[i * 2 + 1]);
  if ((n - 1) % step !== 0) out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}
