// The painted floor of a room: a GRID x GRID array of cells (0.5 m), each 0 or a material number. Pure (no DOM); the painter and the editor share it.
import { GRID, type Tex } from "./roomDoc";

export const CELL = 0.5, HALF = (GRID * CELL) / 2;           // the grid covers -20 m .. +20 m on both axes
export const decode = (rle: number[]): Uint8Array => {
  const c = new Uint8Array(GRID * GRID); let k = 0;
  for (let i = 0; i + 1 < rle.length; i += 2) { const n = rle[i], v = rle[i + 1]; if (v) c.fill(v, k, k + n); k += n; }
  return c;
};
export const encode = (c: Uint8Array): number[] => {
  const out: number[] = []; let i = 0, any = false;
  while (i < c.length) { let j = i + 1; while (j < c.length && c[j] === c[i]) j++; out.push(j - i, c[i]); if (c[i]) any = true; i = j; }
  return any ? out : [];
};
/** Cell index under a world point, or -1 outside the grid. */
export const cellAt = (x: number, z: number): number => {
  const cx = Math.floor((x + HALF) / CELL), cz = Math.floor((z + HALF) / CELL);
  return cx < 0 || cz < 0 || cx >= GRID || cz >= GRID ? -1 : cz * GRID + cx;
};
export const cellX = (i: number): number => (i % GRID) * CELL - HALF;
export const cellZ = (i: number): number => Math.floor(i / GRID) * CELL - HALF;

/** Paint a disc of `radius` cells around the point with material v (0 erases). Returns whether anything changed. */
export function paintDisc(c: Uint8Array, x: number, z: number, radius: number, v: number): boolean {
  const cx = Math.floor((x + HALF) / CELL), cz = Math.floor((z + HALF) / CELL); let changed = false;
  for (let dz = -radius + 1; dz < radius; dz++) for (let dx = -radius + 1; dx < radius; dx++) {
    if (dx * dx + dz * dz >= radius * radius) continue;
    const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= GRID || Z >= GRID) continue;
    const i = Z * GRID + X; if (c[i] !== v) { c[i] = v; changed = true; }
  }
  return changed;
}
/** Replace the connected area of the same material around cell i with v (4-neighbour). */
export function floodFill(c: Uint8Array, i: number, v: number): boolean {
  const from = c[i]; if (i < 0 || from === v) return false;
  const stack = [i]; c[i] = v;
  while (stack.length) {
    const k = stack.pop()!, x = k % GRID, z = (k - x) / GRID;
    if (x > 0 && c[k - 1] === from) { c[k - 1] = v; stack.push(k - 1); }
    if (x < GRID - 1 && c[k + 1] === from) { c[k + 1] = v; stack.push(k + 1); }
    if (z > 0 && c[k - GRID] === from) { c[k - GRID] = v; stack.push(k - GRID); }
    if (z < GRID - 1 && c[k + GRID] === from) { c[k + GRID] = v; stack.push(k + GRID); }
  }
  return true;
}

export interface Rect { x0: number; z0: number; x1: number; z1: number; t: number }
/** The painted cells as few rectangles (runs along x, merged downwards when they line up). */
export function rectsOf(c: Uint8Array): Rect[] {
  const out: Rect[] = [], open = new Map<string, Rect>();   // key: x range + material of a run ending on the previous row
  for (let z = 0; z < GRID; z++) {
    const next = new Map<string, Rect>();
    let x = 0;
    while (x < GRID) {
      const t = c[z * GRID + x]; if (!t) { x++; continue; }
      let e = x + 1; while (e < GRID && c[z * GRID + e] === t) e++;
      const key = x + ":" + e + ":" + t, prev = open.get(key);
      if (prev) { prev.z1 = (z + 1) * CELL - HALF; next.set(key, prev); open.delete(key); }
      else { const r = { x0: x * CELL - HALF, z0: z * CELL - HALF, x1: e * CELL - HALF, z1: (z + 1) * CELL - HALF, t }; out.push(r); next.set(key, r); }
      x = e;
    }
    open.clear(); for (const [k, r] of next) open.set(k, r);
  }
  return out;
}

export interface Block { x: number; z: number; s: number; t: number }
/** Square tiles to draw textured: 1 m blocks where a whole aligned 2x2 of cells shares a material (and its scale is at least 1 m), else single cells. */
export function blocksOf(c: Uint8Array, tex: Tex[]): Block[] {
  const out: Block[] = [], done = new Uint8Array(GRID * GRID);
  for (let z = 0; z < GRID; z += 2) for (let x = 0; x < GRID; x += 2) {
    const i = z * GRID + x, t = c[i];
    if (t && tex[t - 1] && tex[t - 1].scale >= 1 && c[i + 1] === t && c[i + GRID] === t && c[i + GRID + 1] === t) {
      out.push({ x: x * CELL - HALF, z: z * CELL - HALF, s: 1, t }); done[i] = done[i + 1] = done[i + GRID] = done[i + GRID + 1] = 1;
    }
  }
  for (let i = 0; i < c.length; i++) if (c[i] && !done[i]) out.push({ x: cellX(i), z: cellZ(i), s: CELL, t: c[i] });
  return out;
}
export const frac = (v: number): number => v - Math.floor(v);

/** Everything the painter needs about a room's floor, built once per document change. */
export interface FloorLayer { cells: Uint8Array; rects: Rect[]; blocks: Block[]; tex: Tex[]; scrolls: boolean }
export function buildFloor(rle: number[], tex: Tex[]): FloorLayer | null {
  if (!rle.length || !tex.length) return null;
  const cells = decode(rle);
  return { cells, rects: rectsOf(cells), blocks: blocksOf(cells, tex), tex, scrolls: tex.some((t) => t.scroll !== 0) };
}
