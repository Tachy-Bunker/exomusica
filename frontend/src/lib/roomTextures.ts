// Procedural looping textures: a 64 px tile drawn once per (kind, tint), repeated 2x2 into a 128 px sheet so a scrolling source rectangle never needs to wrap.
// Every shape is drawn at the tile and its neighbours so the edges meet. Nothing is downloaded.
import { rgba } from "./roomPaint";
import { isUpload } from "./roomDoc";

export const TILE = 64;
const sheets = new Map<string, HTMLCanvasElement>();

function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
/** Run `f` with the origin shifted to each of the nine neighbouring tiles, so shapes crossing an edge reappear on the other side. */
function wrapped(g: CanvasRenderingContext2D, f: () => void): void { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { g.save(); g.translate(dx * TILE, dy * TILE); f(); g.restore(); } }

function drawKind(g: CanvasRenderingContext2D, kind: string, tint: string): void {
  const r = rng(kind.length * 7919 + 17), line = rgba(tint, 0.85), soft = rgba(tint, 0.35);
  g.fillStyle = rgba(tint, 0.12); g.fillRect(0, 0, TILE, TILE);
  g.lineWidth = 2; g.strokeStyle = line; g.fillStyle = line; g.lineCap = "square";
  switch (kind) {
    case "scan": for (let y = 2; y < TILE; y += 8) { g.fillStyle = y % 16 === 2 ? line : soft; g.fillRect(0, y, TILE, 2); } break;
    case "grid": g.fillRect(0, 0, TILE, 2); g.fillRect(0, 0, 2, TILE); g.fillStyle = soft; g.fillRect(0, 32, TILE, 1); g.fillRect(32, 0, 1, TILE); break;
    case "diamond": wrapped(g, () => { g.beginPath(); g.moveTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.lineTo(0, 32); g.closePath(); g.stroke(); }); break;
    case "circuit": wrapped(g, () => {
      const q = rng(99); g.lineWidth = 2;
      for (let k = 0; k < 9; k++) { let x = Math.floor(q() * 8) * 8, y = Math.floor(q() * 8) * 8; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 3; s++) { if (q() < 0.5) x += (q() < 0.5 ? -1 : 1) * (8 + Math.floor(q() * 3) * 8); else y += (q() < 0.5 ? -1 : 1) * (8 + Math.floor(q() * 3) * 8); g.lineTo(x, y); } g.stroke(); g.fillRect(x - 3, y - 3, 6, 6); }
    }); break;
    case "water": for (let k = 0; k < 4; k++) { g.beginPath(); for (let x = 0; x <= TILE; x += 2) { const y = k * 16 + 8 + Math.sin((x / TILE) * Math.PI * 4 + k) * 3; if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); } break;
    case "brick": for (let row = 0; row < 4; row++) { const y = row * 16, off = row % 2 ? 16 : 0; g.fillRect(0, y, TILE, 2); for (let x = off; x < TILE + 32; x += 32) g.fillRect(x % TILE, y, 2, 16); } break;
    case "static": for (let k = 0; k < 420; k++) { g.fillStyle = rgba(tint, 0.2 + r() * 0.7); g.fillRect(Math.floor(r() * TILE), Math.floor(r() * TILE), 2, 2); } break;
    default: for (let k = 0; k < 110; k++) { g.fillStyle = rgba(tint, 0.15 + r() * 0.6); const s = 1 + r() * 3; g.beginPath(); g.arc(r() * TILE, r() * TILE, s, 0, 7); g.fill(); } // noise
  }
}
// ---- pictures from the library: fetched once, shrunk into a sheet, and the room repaints when one arrives
interface Up { sheet: HTMLCanvasElement | null; avg: string; state: 0 | 1 | 2 }
const ups = new Map<string, Up>(), listeners = new Set<() => void>();
export const onTexReady = (f: () => void): (() => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const UP_TILE = 128;
function loadUpload(kind: string): Up {
  let u = ups.get(kind); if (u) return u;
  u = { sheet: null, avg: "", state: 0 }; ups.set(kind, u); const me = u;
  if (typeof Image === "undefined") return u;
  const img = new Image();
  img.onload = () => {
    const t = document.createElement("canvas"); t.width = t.height = UP_TILE; const tg = t.getContext("2d"), c = document.createElement("canvas"); c.width = c.height = UP_TILE * 2; const g = c.getContext("2d");
    if (!tg || !g) { me.state = 2; return; }
    tg.drawImage(img, 0, 0, UP_TILE, UP_TILE);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(t, x * UP_TILE, y * UP_TILE);
    const a = document.createElement("canvas"); a.width = a.height = 1; const ag = a.getContext("2d");
    if (ag) { ag.drawImage(img, 0, 0, 1, 1); const d = ag.getImageData(0, 0, 1, 1).data; me.avg = `rgba(${d[0]},${d[1]},${d[2]},0.35)`; }
    me.sheet = c; me.state = 1; listeners.forEach((f) => f());
  };
  img.onerror = () => { me.state = 2; };
  img.src = `/api/room-textures/${kind.slice(1)}`;
  return u;
}
// ---- skies: one wide picture per id, kept as the image itself (drawn straight from it every frame)
const skies = new Map<number, { img: HTMLImageElement | null; state: 0 | 1 | 2 }>();
/** The sky picture once loaded, else null (and the room repaints when it arrives). */
export function skyImage(id: number): HTMLImageElement | null {
  let u = skies.get(id); if (u) return u.img;
  u = { img: null, state: 0 }; skies.set(id, u); const me = u;
  if (typeof Image === "undefined") return null;
  const img = new Image(); img.onload = () => { me.img = img; me.state = 1; listeners.forEach((f) => f()); }; img.onerror = () => { me.state = 2; };
  img.src = `/api/room-textures/${id}`; return null;
}
/** Average colour of a picture material once it has loaded (for the flat pass), else null. */
export const texAvg = (kind: string): string | null => (isUpload(kind) ? ups.get(kind)?.avg || null : null);
/** Pixels per repeat in a sheet (the sheet holds 2 x 2 repeats). */
export const sheetTile = (sheet: HTMLCanvasElement): number => sheet.width / 2;

/** The sheet for a kind and tint (built once, then reused). Pictures return null until they have loaded. */
export function texSheet(kind: string, tint: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (isUpload(kind)) return loadUpload(kind).sheet;
  const key = kind + tint; let c = sheets.get(key); if (c) return c;
  const t = document.createElement("canvas"); t.width = t.height = TILE; const tg = t.getContext("2d"); if (!tg) return null;
  drawKind(tg, kind, tint);
  c = document.createElement("canvas"); c.width = c.height = TILE * 2; const g = c.getContext("2d"); if (!g) return null;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(t, x * TILE, y * TILE);
  sheets.set(key, c); return c;
}
