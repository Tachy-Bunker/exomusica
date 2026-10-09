import { gradientTable } from "./studioDsp";
import { colorFromImageUrl } from "./imageColor";

/** The strip is 250 x 20 measured points, 4 bits each (2500 bytes over the wire); the browser stretches it smooth and colours it. */
export const STRIP_W = 250;
export const STRIP_H = 20;
export const STRIP_BYTES = (STRIP_W * STRIP_H) / 2;

/** Two 4-bit points per byte, high half first. Null if it is not a whole strip. */
export function unpackPoints(b: Uint8Array): Uint8Array | null {
  if (b.length !== STRIP_BYTES) return null;
  const out = new Uint8Array(STRIP_W * STRIP_H);
  for (let i = 0; i < b.length; i++) { out[i * 2] = b[i] >> 4; out[i * 2 + 1] = b[i] & 15; }
  return out;
}

export type Strip = Uint8Array | "none"; // levels 0..15, row-major; "none" = this server can't measure it: the player keeps its plain bar
const mem = new Map<number, Promise<Strip>>();

/** One request per track per page load (the server measures it once, ever, and the browser keeps it for a year). */
export function loadStrip(trackId: number): Promise<Strip> {
  let p = mem.get(trackId);
  if (!p) {
    p = fetch(`/api/tracks/${trackId}/spectrogram`)
      .then(async (r) => { if (!r.ok) return "none" as const; return unpackPoints(new Uint8Array(await r.arrayBuffer())) ?? ("none" as const); })
      .catch(() => "none" as const);
    mem.set(trackId, p);
    if (mem.size > 6) mem.delete(mem.keys().next().value as number); // a few tracks are enough
  }
  return p;
}

// ---- colour: the strip takes the main colour of the cover art
function toHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
/** 16 levels as RGB (48 bytes): dark at 0, the cover's colour in the middle, a lit-up version of it at the top.
 *  A grey or dull cover still gets a readable, slightly saturated ramp. Null colour = the site's own gradient. */
export function rampFor(hex: string | null): Uint8Array {
  const out = new Uint8Array(48);
  const hsl = hex ? toHsl(hex) : null;
  if (!hsl) { const t = gradientTable(); for (let i = 0; i < 16; i++) { const v = Math.round((i / 15) * 255) * 3; out[i * 3] = t[v]; out[i * 3 + 1] = t[v + 1]; out[i * 3 + 2] = t[v + 2]; } return out; }
  const [h, s0] = hsl; const s = hsl[1] === 0 ? 0 : Math.min(0.9, Math.max(0.5, s0));
  for (let i = 0; i < 16; i++) {
    const t = i / 15, l = 0.05 + Math.pow(t, 0.85) * 0.62, sat = s * (t > 0.8 ? 1 - (t - 0.8) * 1.6 : 1);
    const [r, g, b] = hslToRgb(h, sat, l); out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }
  return out;
}

/** Levels to RGBA through a ramp. */
export function paintStrip(ctx: CanvasRenderingContext2D, levels: Uint8Array, ramp: Uint8Array): void {
  const img = ctx.createImageData(STRIP_W, STRIP_H);
  const d = img.data;
  for (let i = 0; i < levels.length; i++) { const v = levels[i] * 3, o = i * 4; d[o] = ramp[v]; d[o + 1] = ramp[v + 1]; d[o + 2] = ramp[v + 2]; d[o + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}

const colors = new Map<string, Promise<string | null>>();
/** The cover's average colour, once per picture. */
export function coverColor(url: string | null | undefined): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  let p = colors.get(url);
  if (!p) { p = colorFromImageUrl(url); colors.set(url, p); if (colors.size > 24) colors.delete(colors.keys().next().value as string); }
  return p;
}

export interface TrackComment { id: number; atSeconds: number; body: string; createdAt: string; user: string; avatarUrl: string | null; userId: number }

/** Comments heard around a moment, nearest first. */
export function nearbyComments(list: TrackComment[], t: number, span = 4): TrackComment[] {
  return list.filter((c) => Math.abs(c.atSeconds - t) <= span).sort((a, b) => Math.abs(a.atSeconds - t) - Math.abs(b.atSeconds - t));
}
