// The branch explorer's world: rooms of different shapes on rings around a central hall, joined by pipe corridors and elevator shafts. Pure (no DOM), so it is tested without a browser.
// Units are arbitrary "metres"; x/z are the floor plan, y is up.

export interface HullNode { id: number; parentId: number | null; slug: string; name: string; secret?: boolean; key?: string; /** sealed rooms: the milestone key that gates the door */ gate?: string | null; tracks: number; albums: number }
export type Shape = "box" | "oct" | "tower" | "slab" | "ring";
export interface HullRoom { id: number; slug: string; name: string; secret: boolean; key: string; gate: string; x: number; y: number; z: number; w: number; d: number; h: number; shape: Shape; depth: number; parentId: number | null; angle: number; outer: boolean; tracks: number; albums: number }
export type V3 = [number, number, number];
export interface HullLink { from: number; to: number; pts: V3[]; shaft: { x: number; z: number; y0: number; y1: number } | null; dashed: boolean }
export interface Hull { rooms: HullRoom[]; links: HullLink[]; radius: number }

const FLOOR = 1.7;       // height between floors
const GAP = 9;           // least distance between rings
const SLOT = 8;          // floor-plan room needs about this much arc
const OUTER_PAD = 9;     // how far outside the last ring the sealed ring sits
const MAX_R = 140;

function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** The shape a branch gets is fixed by its name: it never changes between visits or between people. */
export function shapeOf(seed: string): Shape { return (["box", "oct", "tower", "slab"] as const)[fnv(seed) % 4]; }

/** Rooms and links for the nodes. Sealed (secret) rooms are left out unless `outer`, in which case they sit on a ring of their own outside everything else.
 *  A node whose parent is missing (or sealed and left out) hangs from the nearest ancestor that is there; cycles and orphans cannot hang it. */
export interface MapOverride { slug: string; x: number | null; z: number | null; level: number | null }
export const FLOOR_H = FLOOR;
export function layoutHull(nodes: HullNode[], opts: { outer: boolean; overrides?: readonly MapOverride[] | null }): Hull {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const shown = (n: HullNode): boolean => !n.secret;
  const real = nodes.filter(shown), realIds = new Set(real.map((n) => n.id));
  const parentOf = (n: HullNode): number | null => {
    let p = n.parentId, guard = 0;
    while (p != null && guard++ < 1000) { if (p === n.id) return null; if (realIds.has(p)) return p; p = byId.get(p)?.parentId ?? null; }
    return null;
  };
  const kids = new Map<number, HullNode[]>(); const roots: HullNode[] = [];
  for (const n of real) { const p = parentOf(n); if (p == null) roots.push(n); else { const a = kids.get(p) ?? []; a.push(n); kids.set(p, a); } }
  // a cycle with no root still has to show: break it at its first member
  const seen = new Set<number>();
  const walk = (n: HullNode): void => { if (seen.has(n.id)) return; seen.add(n.id); for (const c of kids.get(n.id) ?? []) walk(c); };
  for (const r of roots) walk(r);
  for (const n of real) if (!seen.has(n.id)) { const p = parentOf(n); if (p != null) { kids.set(p, (kids.get(p) ?? []).filter((c) => c.id !== n.id)); } roots.push(n); walk(n); }

  const maxTracks = Math.max(1, ...nodes.map((n) => n.tracks));
  const single = roots.length === 1;
  const leaves = new Map<number, number>();
  const countLeaves = (n: HullNode, guard: Set<number>): number => {
    if (guard.has(n.id)) return 1; guard.add(n.id);
    const ch = kids.get(n.id) ?? []; const v = ch.length === 0 ? 1 : ch.reduce((s, c) => s + countLeaves(c, guard), 0);
    leaves.set(n.id, v); return v;
  };
  for (const r of roots) countLeaves(r, new Set());

  // angles: each node takes a slice of its parent's slice, in proportion to the leaves under it
  const info = new Map<number, { depth: number; angle: number; level: number }>();
  const place = (n: HullNode, depth: number, a0: number, a1: number, parentLevel = 0): void => {
    const f = fnv(n.slug || String(n.id)) % 6, level = depth <= 1 && single ? 0 : Math.max(-2, Math.min(2, parentLevel + (f === 0 ? 1 : f === 1 ? -1 : 0)));
    info.set(n.id, { depth, angle: (a0 + a1) / 2, level });
    const ch = kids.get(n.id) ?? []; const total = ch.reduce((s, c) => s + (leaves.get(c.id) ?? 1), 0) || 1;
    let a = a0;
    for (const c of ch) { const span = ((a1 - a0) * (leaves.get(c.id) ?? 1)) / total; place(c, depth + 1, a, a + span, level); a += span; }
  };
  if (single) place(roots[0], 0, 0, Math.PI * 2, 0);
  else {
    const total = roots.reduce((s, r) => s + (leaves.get(r.id) ?? 1), 0) || 1; let a = 0;
    for (const r of roots) { const span = (Math.PI * 2 * (leaves.get(r.id) ?? 1)) / total; place(r, 1, a, a + span, 0); a += span; }
  }

  // ring radii: far enough apart, and far enough out that the nearest two rooms on a ring don't touch
  const maxDepth = Math.max(0, ...[...info.values()].map((i) => i.depth));
  const radius: number[] = [0];
  for (let d = 1; d <= maxDepth; d++) {
    const angles = real.filter((n) => info.get(n.id)!.depth === d).map((n) => info.get(n.id)!.angle).sort((a, b) => a - b);
    let minGap = Math.PI * 2;
    for (let i = 0; i < angles.length; i++) { const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2; if (angles.length > 1) minGap = Math.min(minGap, Math.max(next - angles[i], 0.02)); }
    const need = angles.length > 1 ? SLOT / minGap : 0;
    radius[d] = Math.min(MAX_R, Math.max(radius[d - 1] + GAP, need));
  }
  const outerR = Math.min(MAX_R + OUTER_PAD, (radius[maxDepth] ?? 0) + OUTER_PAD);

  const rooms: HullRoom[] = [];
  const make = (n: HullNode, depth: number, angle: number, r: number, outer: boolean, lvl = 0): HullRoom => {
    const sz = Math.sqrt(n.tracks / maxTracks), f = fnv(n.slug || n.key || String(n.id));
    const isHub = single && depth === 0 && !outer;
    const shape: Shape = isHub ? "ring" : outer ? "oct" : shapeOf(n.slug);
    let w = 3.6 + 2.2 * sz, h = 1.8 + 2.2 * sz, d = w;
    if (shape === "box") d = w * (0.8 + (f % 3) * 0.2);
    if (shape === "tower") { w *= 0.62; d = w; h *= 2; }
    if (shape === "slab") { w *= 1.3; d = w * 0.9; h *= 0.5; }
    if (shape === "ring") { w = 11; d = 11; h = 2.4; }
    const y = outer ? 0.8 : lvl * FLOOR;
    return { id: n.id, slug: n.slug, name: n.name, secret: !!n.secret, key: n.key ?? "", gate: n.gate ?? "", x: Math.cos(angle) * r + 0, y, z: Math.sin(angle) * r + 0, w, d, h, shape, depth, parentId: n.parentId, angle, outer, tracks: n.tracks, albums: n.albums };
  };
  for (const n of real) { const i = info.get(n.id)!; rooms.push(make(n, i.depth, i.angle, radius[i.depth] ?? 0, false, i.level)); }
  const roomOf = new Map(rooms.map((r) => [r.id, r]));

  // sealed rooms: on the outer ring, each under the slice of its nearest visible ancestor, spread out inside that slice
  const secrets = opts.outer ? nodes.filter((n) => n.secret) : [];
  const anc = (n: HullNode): number | null => { let p = n.parentId, g = 0; while (p != null && g++ < 1000) { if (realIds.has(p)) return p; p = byId.get(p)?.parentId ?? null; } return null; };
  const groups = new Map<number | null, HullNode[]>();
  for (const s of secrets) { const a = anc(s); const g = groups.get(a) ?? []; g.push(s); groups.set(a, g); }
  const outerAngles: number[] = [];
  for (const [a, list] of groups) {
    const base = a != null ? info.get(a)!.angle : Math.PI * 1.5;
    list.forEach((s, i) => { const ang = base + (i - (list.length - 1) / 2) * (SLOT / Math.max(outerR, 1)); outerAngles.push(ang); rooms.push(make(s, maxDepth + 1, ang, outerR, true)); });
  }

  if (opts.overrides?.length) { // the owner's moves win over the automatic layout (only for rooms that are shown)
    const ov = new Map(opts.overrides.map((o) => [o.slug, o]));
    for (const r of rooms) { const o = ov.get(r.slug); if (!o) continue; if (o.x != null) r.x = o.x; if (o.z != null) r.z = o.z; if (o.level != null && !r.outer) r.y = o.level * FLOOR; }
  }
  const links: HullLink[] = [];
  const door = (r: HullRoom, tx: number, tz: number): V3 => { const dx = tx - r.x, dz = tz - r.z, L = Math.hypot(dx, dz) || 1, rad = Math.max(r.w, r.d) / 2; return [r.x + (dx / L) * rad, r.y + Math.min(r.h * 0.4, 0.8), r.z + (dz / L) * rad]; };
  const link = (a: HullRoom, b: HullRoom, dashed: boolean): HullLink => {
    const s = door(a, b.x, b.z), e = door(b, a.x, a.z);
    const pts: V3[] = [s];
    const corner: V3 = [e[0], s[1], s[2]]; if (Math.hypot(corner[0] - s[0], corner[2] - s[2]) > 0.01) pts.push(corner);
    const corner2: V3 = [e[0], s[1], e[2]]; if (Math.hypot(corner2[0] - corner[0], corner2[2] - corner[2]) > 0.01) pts.push(corner2);
    let shaft: HullLink["shaft"] = null;
    if (Math.abs(e[1] - s[1]) > 0.2) { pts.push([e[0], e[1], e[2]]); shaft = { x: e[0], z: e[2], y0: Math.min(s[1], e[1]), y1: Math.max(s[1], e[1]) }; }
    return { from: a.id, to: b.id, pts, shaft, dashed };
  };
  for (const r of rooms) {
    if (r.outer) { const a = anc(byId.get(r.id)!); const p = a != null ? roomOf.get(a) : undefined; if (p) links.push(link(p, r, true)); continue; }
    const p = parentOf(byId.get(r.id)!); const pr = p != null ? roomOf.get(p) : undefined; if (pr) links.push(link(pr, r, false));
  }
  const far = rooms.reduce((m, r) => Math.max(m, Math.hypot(r.x, r.z) + Math.max(r.w, r.d)), 8);
  return { rooms, links, radius: far };
}

// ---- meshes: what is drawn for a room (local coordinates; add the room's x/y/z)
export interface Mesh { verts: Float32Array; edges: Uint16Array; faces: number[][] }

function prism(n: number, rx: number, rz: number, h: number, rot: number, y0 = 0): { verts: number[]; edges: number[]; faces: number[][] } {
  const verts: number[] = [], edges: number[] = [], faces: number[][] = [];
  for (let k = 0; k < n; k++) { const a = rot + (k / n) * Math.PI * 2; verts.push(Math.cos(a) * rx, y0, Math.sin(a) * rz); }
  for (let k = 0; k < n; k++) { const a = rot + (k / n) * Math.PI * 2; verts.push(Math.cos(a) * rx, y0 + h, Math.sin(a) * rz); }
  for (let k = 0; k < n; k++) { const m = (k + 1) % n; edges.push(k, m, n + k, n + m, k, n + k); faces.push([k, m, n + m, n + k]); }
  faces.push(Array.from({ length: n }, (_, k) => n + k));
  return { verts, edges, faces };
}
/** The wire shape of a room. A box is a 4-sided prism turned a quarter; "oct" and the others are round-ish drums; the ring is two stacked drums with a hole. */
export function roomMesh(r: Pick<HullRoom, "shape" | "w" | "d" | "h">): Mesh {
  let p: { verts: number[]; edges: number[]; faces: number[][] };
  if (r.shape === "box") p = prism(4, (r.w / 2) * Math.SQRT2, (r.d / 2) * Math.SQRT2, r.h, Math.PI / 4);
  else if (r.shape === "oct") p = prism(8, r.w / 2, r.d / 2, r.h, Math.PI / 8);
  else if (r.shape === "tower") p = prism(6, r.w / 2, r.d / 2, r.h, 0);
  else if (r.shape === "slab") p = prism(6, r.w / 2, r.d / 2, r.h, 0);
  else {
    const outer = prism(16, r.w / 2, r.d / 2, r.h, 0), inner = prism(16, r.w * 0.28, r.d * 0.28, r.h, 0);
    const o = outer.verts.length / 3;
    p = { verts: [...outer.verts, ...inner.verts], edges: [...outer.edges, ...inner.edges.map((i) => i + o)], faces: [...outer.faces.slice(0, 16), ...inner.faces.slice(0, 16).map((f) => f.map((i) => i + o))] };
    // a middle ring on the outer wall, so it reads as stacked
    const base = p.verts.length / 3;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; p.verts.push(Math.cos(a) * (r.w / 2) * 1.04, r.h / 2, Math.sin(a) * (r.d / 2) * 1.04); }
    for (let k = 0; k < 16; k++) p.edges.push(base + k, base + ((k + 1) % 16));
  }
  return { verts: new Float32Array(p.verts), edges: new Uint16Array(p.edges), faces: p.faces };
}

/** A pipe along the link's points: four long edges per leg and a square at every bend. Flat list of segments: x1 y1 z1 x2 y2 z2... */
export function pipeSegments(pts: V3[], half = 0.32): number[] {
  const out: number[] = [];
  const quad = (p: V3, dir: V3): V3[] => { // the square across the pipe at p
    const up: V3 = [0, 1, 0]; const side: V3 = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [-dir[2], 0, dir[0]];
    const L = Math.hypot(side[0], side[1], side[2]) || 1; const s: V3 = [side[0] / L, side[1] / L, side[2] / L];
    const u: V3 = Math.abs(dir[1]) > 0.9 ? [0, 0, 1] : up;
    return [[p[0] + (s[0] + u[0]) * half, p[1] + (s[1] + u[1]) * half, p[2] + (s[2] + u[2]) * half], [p[0] + (-s[0] + u[0]) * half, p[1] + (-s[1] + u[1]) * half, p[2] + (-s[2] + u[2]) * half], [p[0] + (-s[0] - u[0]) * half, p[1] + (-s[1] - u[1]) * half, p[2] + (-s[2] - u[2]) * half], [p[0] + (s[0] - u[0]) * half, p[1] + (s[1] - u[1]) * half, p[2] + (s[2] - u[2]) * half]];
  };
  const dirOf = (a: V3, b: V3): V3 => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1; return [dx / L, dy / L, dz / L]; };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], d = dirOf(a, b), qa = quad(a, d), qb = quad(b, d);
    for (let k = 0; k < 4; k++) { out.push(...qa[k], ...qb[k]); out.push(...qa[k], ...qa[(k + 1) % 4]); }
    if (i + 2 === pts.length) for (let k = 0; k < 4; k++) out.push(...qb[k], ...qb[(k + 1) % 4]);
  }
  return out;
}
