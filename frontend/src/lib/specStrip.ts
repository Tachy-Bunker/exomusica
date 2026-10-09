import { gradientTable } from "./studioDsp";

export const STRIP_W = 1000;
export const STRIP_H = 40;

export type Strip = Uint8Array | "none";
const mem = new Map<number, Promise<Strip>>();

/** One request per track per page load (the server draws it once, ever, and the browser keeps it for a year). "none" = this server can't draw it: the player keeps its plain bar. */
export function loadStrip(trackId: number): Promise<Strip> {
  let p = mem.get(trackId);
  if (!p) {
    p = fetch(`/api/tracks/${trackId}/spectrogram`)
      .then(async (r) => { if (!r.ok) return "none" as const; const b = new Uint8Array(await r.arrayBuffer()); return b.length === STRIP_W * STRIP_H ? b : ("none" as const); })
      .catch(() => "none" as const);
    mem.set(trackId, p);
    if (mem.size > 6) mem.delete(mem.keys().next().value as number); // a few tracks are enough
  }
  return p;
}

let table: Uint8Array | null = null;
/** Brightness bytes to RGBA through the site's accent gradient. */
export function paintStrip(ctx: CanvasRenderingContext2D, strip: Uint8Array): void {
  table ??= gradientTable();
  const img = ctx.createImageData(STRIP_W, STRIP_H);
  const d = img.data;
  for (let i = 0; i < strip.length; i++) { const v = strip[i] * 3, o = i * 4; d[o] = table[v]; d[o + 1] = table[v + 1]; d[o + 2] = table[v + 2]; d[o + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}

export interface TrackComment { id: number; atSeconds: number; body: string; createdAt: string; user: string; avatarUrl: string | null; userId: number }

/** Comments heard around a moment, nearest first. */
export function nearbyComments(list: TrackComment[], t: number, span = 4): TrackComment[] {
  return list.filter((c) => Math.abs(c.atSeconds - t) <= span).sort((a, b) => Math.abs(a.atSeconds - t) - Math.abs(b.atSeconds - t));
}
