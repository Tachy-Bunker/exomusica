// The explorer's camera: orbit around a target, perspective, no DOM. Pure, so projection, panning and picking are tested without a browser.
export interface Cam { yaw: number; pitch: number; dist: number; tx: number; ty: number; tz: number }
export const FOV_K = 1.15; // focal length as a multiple of the viewport's shorter side

export const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));
export const defaultCam = (radius: number): Cam => ({ yaw: -0.55, pitch: 0.62, dist: Math.max(18, radius * 2.3), tx: 0, ty: 0, tz: 0 });
/** Any angle wraps round into (-PI, PI]: nothing stops the view at the top or the bottom, it just keeps turning (and goes upside down), like a trackball. */
export const wrapAngle = (a: number): number => { const t = Math.PI * 2, m = ((a % t) + t) % t; return m > Math.PI ? m - t : m; };
export const clampCam = (c: Cam, radius: number): Cam => ({ ...c, yaw: wrapAngle(c.yaw), pitch: wrapAngle(c.pitch), dist: clamp(c.dist, 5, Math.max(40, radius * 6)) });
/** True when the map is turned so far that its up is down: left and right then have to swap for dragging to feel the same. */
export const upsideDown = (c: Cam): boolean => Math.cos(c.pitch) < 0;
/** Whether the view is (near enough) straight down from above. */
export const isTopView = (c: Cam): boolean => Math.abs(wrapAngle(c.pitch) - Math.PI / 2) < 0.08;

export function focalOf(w: number, h: number): number { return Math.min(w, h) * FOV_K; }

/** World point to screen: x, y in pixels and z = distance in front of the camera (<= 0.5 means behind it). */
export function project(c: Cam, wx: number, wy: number, wz: number, w: number, h: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const x = wx - c.tx, y = wy - c.ty, z = wz - c.tz;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const x1 = x * cy - z * sy, z1 = x * sy + z * cy;           // turn around the vertical axis
  const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;          // tilt
  const zc = z2 + c.dist, f = focalOf(w, h);
  out[2] = zc;
  if (zc <= 0.5) { out[0] = NaN; out[1] = NaN; return out; }
  const s = f / zc;
  out[0] = w / 2 + x1 * s; out[1] = h / 2 - y2 * s;
  return out;
}

/** Slide the target so the scene follows the pointer: dx, dy in screen pixels. */
export function panBy(c: Cam, dx: number, dy: number, w: number, h: number): Cam {
  const k = c.dist / focalOf(w, h); // world units per pixel at the target
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  // screen right and screen up as world vectors
  const rx = cy, rz = -sy, ux = -sy * sp, uy = cp, uz = -cy * sp;
  return { ...c, tx: c.tx - (dx * rx - dy * ux) * k, ty: c.ty - (-dy * uy) * k, tz: c.tz - (dx * rz - dy * uz) * k };
}

export interface Pickable { id: number; x: number; y: number; z: number; r: number }
/** The nearest room under a screen point (within its apparent radius plus a little slack), or null. */
export function pick(c: Cam, rooms: Pickable[], px: number, py: number, w: number, h: number, slack = 10): number | null {
  const f = focalOf(w, h), p: [number, number, number] = [0, 0, 0];
  let best: number | null = null, bestD = Infinity;
  for (const r of rooms) {
    project(c, r.x, r.y, r.z, w, h, p);
    if (!(p[2] > 0.5)) continue;
    const rad = (r.r * f) / p[2] + slack, d = Math.hypot(px - p[0], py - p[1]);
    if (d <= rad && d - rad < bestD) { bestD = d - rad; best = r.id; }
  }
  return best;
}
