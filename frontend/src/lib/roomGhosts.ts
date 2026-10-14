// Echoes of members in a room: faint figures retracing what a recent visitor did. Allocation-free after setup; pure (no DOM).
import type { Shown } from "./roomNet";

export interface GhostIn { id: number; name: string; agoMs: number; s: number[] }
export interface Ghost { id: number; name: string; note: string; n: number; x: Float32Array; z: Float32Array; yaw: Float32Array; dur: number; period: number; phase: number }
export const STEP_S = 0.4, FADE_S = 1.2, GAP_S = 6, MAX_GHOSTS = 10;

const hash = (n: number): number => { let h = Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
export function agoText(ms: number): string {
  const m = Math.round(ms / 60000); if (m < 2) return "just now"; if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60); return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
/** From what the server sent. Anything malformed is skipped. Each loops on its own phase so they do not all start together. */
export function parseGhosts(list: unknown): Ghost[] {
  const out: Ghost[] = []; if (!Array.isArray(list)) return out;
  for (const g of list as GhostIn[]) {
    if (out.length >= MAX_GHOSTS || !g || typeof g.id !== "number" || typeof g.name !== "string" || !Array.isArray(g.s)) continue;
    const n = Math.floor(g.s.length / 3); if (n < 4) continue;
    const x = new Float32Array(n), z = new Float32Array(n), yaw = new Float32Array(n);
    for (let i = 0; i < n; i++) { x[i] = Number(g.s[i * 3]) || 0; z[i] = Number(g.s[i * 3 + 1]) || 0; yaw[i] = Number(g.s[i * 3 + 2]) || 0; }
    const dur = (n - 1) * STEP_S + 2 * FADE_S, period = dur + GAP_S;
    out.push({ id: g.id, name: g.name, note: `${g.name} · ${agoText(Number(g.agoMs) || 0)}`, n, x, z, yaw, dur, period, phase: hash(g.id) * period });
  }
  return out;
}

const wrapAngle = (a: number): number => { const t = Math.PI * 2, m = ((a % t) + t) % t; return m > Math.PI ? m - t : m; };
export interface GhostPool { items: Shown[]; count: number; active: boolean; nextStartMs: number }
export const makePool = (): GhostPool => ({ items: Array.from({ length: MAX_GHOSTS }, () => ({ id: 0, name: "", x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, ghost: 0, note: "" } as Shown)), count: 0, active: false, nextStartMs: Infinity });

/** The figures to draw at `nowMs`. `live` hides an echo while its owner is in the room for real; `inside` hides it while it is outside the walls (it walked out through a door). */
export function stepGhosts(gs: readonly Ghost[], nowMs: number, pool: GhostPool, live: ReadonlyMap<number, unknown>, inside: (x: number, z: number) => boolean): void {
  pool.count = 0; pool.active = false; pool.nextStartMs = Infinity; const sec = nowMs / 1000;
  for (const g of gs) {
    const u = (sec + g.phase) % g.period, t = u - FADE_S;           // t = seconds into the walk
    if (live.has(g.id)) continue;
    if (t < -FADE_S || u >= g.dur) { pool.nextStartMs = Math.min(pool.nextStartMs, (g.period - u) * 1000); continue; }
    const wt = Math.max(0, Math.min((g.n - 1) * STEP_S, t)), f = wt / STEP_S, i = Math.min(g.n - 2, Math.floor(f)), k = f - i;
    const x = g.x[i] + (g.x[i + 1] - g.x[i]) * k, z = g.z[i] + (g.z[i + 1] - g.z[i]) * k;
    if (!inside(x, z)) continue;
    const a = Math.max(0, Math.min(1, u / FADE_S, (g.dur - u) / FADE_S)), o = pool.items[pool.count++];
    o.id = -g.id - 1; o.name = g.name; o.x = o.tx = x; o.z = o.tz = z; o.yaw = o.tyaw = g.yaw[i] + wrapAngle(g.yaw[i + 1] - g.yaw[i]) * k; o.ghost = a; o.note = g.note; pool.active = true;
  }
}
