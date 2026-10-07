// The homepage's branch grid: every branch laid out procedurally on a grid that is bigger than the window showing it, plus the maths for a
// camera that travels to a chosen branch. Pure, so it is tested without a browser.

export const TILE_W = 150;
export const TILE_H = 96;
const GAP_X = 22;
const GAP_Y = 20;
const PAD = 24;
/** Space kept under the last row, so the Full screen button in the window's corner never sits on top of a tile. */
const BOTTOM_ROOM = 46;

export interface GridTile { slug: string; x: number; y: number; cx: number; cy: number }
export interface GridLayout { tiles: GridTile[]; width: number; height: number; cols: number; rows: number }

/** A small stable number from a name: the same branch always gets the same nudge. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Lays the branches out row by row on a grid that is wider than tall (every other row shifted half a tile, each tile nudged a little by its
 * name so it looks grown rather than printed). The nudges are small enough that tiles can never touch.
 */
export function gridLayout(slugs: string[], aspect = 1.7): GridLayout {
  const n = slugs.length;
  if (n === 0) return { tiles: [], width: 2 * PAD, height: 2 * PAD, cols: 0, rows: 0 };
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
  const rows = Math.ceil(n / cols);
  const cellW = TILE_W + GAP_X, cellH = TILE_H + GAP_Y;
  const tiles = slugs.map((slug, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const h = hash(slug);
    const jx = ((h & 0xff) / 255 - 0.5) * 12; // within +-6 px
    const jy = (((h >>> 8) & 0xff) / 255 - 0.5) * 10; // within +-5 px
    const x = Math.round(PAD + col * cellW + (row % 2) * (cellW / 2) + jx);
    const y = Math.round(PAD + row * cellH + jy);
    return { slug, x, y, cx: x + TILE_W / 2, cy: y + TILE_H / 2 };
  });
  const shifted = rows > 1 && cols > 0 ? cellW / 2 : 0;
  return { tiles, cols, rows, width: Math.round(2 * PAD + cols * cellW - GAP_X + shifted), height: Math.round(2 * PAD + rows * cellH - GAP_Y + BOTTOM_ROOM) };
}

/** Where the camera's top-left corner should be to centre a tile in the window, kept inside the grid (or centred on it if the grid is smaller). */
export function cameraTarget(tile: GridTile, win: { w: number; h: number }, grid: { width: number; height: number }): { x: number; y: number } {
  const axis = (centre: number, view: number, total: number) => (total <= view ? (total - view) / 2 : Math.min(Math.max(centre - view / 2, 0), total - view));
  return { x: Math.round(axis(tile.cx, win.w, grid.width)), y: Math.round(axis(tile.cy, win.h, grid.height)) };
}

/**
 * One frame of exponential approach: the remaining distance shrinks by the same fraction every moment (fast when far, gentle on arrival),
 * independent of frame rate. `rate` is per second: the distance halves every ln 2 / rate seconds. Snaps once it is within a quarter pixel.
 */
export function stepToward(current: number, target: number, dtSeconds: number, rate = 6): number {
  const remaining = target - current;
  if (Math.abs(remaining) < 0.25) return target;
  return current + remaining * (1 - Math.exp(-rate * Math.max(0, dtSeconds)));
}
