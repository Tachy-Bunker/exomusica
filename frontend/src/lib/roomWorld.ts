// The walkable room of one branch. Pure (no DOM): the footprint comes from the branch's shape on the Explore map, and every door sits in the direction of the room it leads to on that map, so walking round the room is walking round the map.
import type { Hull, HullRoom, Shape } from "./hullLayout";
import type { RoomState } from "./chart";

export interface RoomDoor {
  id: string; toSlug: string | null; name: string | null; state: "open" | "locked"; kind: "parent" | "child" | "sealed";
  x: number; z: number;      // middle of the door on the wall
  nx: number; nz: number;    // unit vector pointing out of the room through the door
  tx: number; tz: number;    // unit vector along the wall
  hw: number;                // half width
  edge: number; angle: number;
  /** Address hash of a sealed room hung from this door (what its scan and its note are made from). */
  key?: string;
}
export interface RoomProp { id: string; kind: "album" | "terminal" | "more"; x: number; z: number; r: number; label: string; href: string; hue: number }
export interface RoomWorld {
  slug: string; name: string; sides: number; rot: number; R: number; inr: number; H: number;
  verts: [number, number][]; doors: RoomDoor[]; props: RoomProp[]; spawn: { x: number; z: number; yaw: number };
  /** An inscription on one wall (scan it for the branch's text), if a wall is free. */
  plaque: { x: number; z: number; nx: number; nz: number; tx: number; tz: number; edge: number } | null;
  /** The branch's own description (shown when the inscription is scanned). */
  blurb?: string;
  /** Where this room lies on the Scan map (used to place the corridor and the room behind a door). */
  map: { x: number; z: number };
  /** The branch's colour; set by the page once the theme is known. */
  color?: string;
}
export interface AlbumLite { slug: string; title: string }
export interface BuildOpts { hull: Hull | null; slug: string; name: string; states: Map<number, RoomState> | null; albums: AlbumLite[]; channelSlug: string | null; from?: string | null }

export const DOOR_W = 1.7, DOOR_H = 2.5, MAX_ALBUMS = 10;
const GAP = 0.9;

function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const SIDES: Record<Shape, { n: number; rot: number; H: number }> = {
  box: { n: 4, rot: Math.PI / 4, H: 3.4 }, oct: { n: 8, rot: Math.PI / 8, H: 3.6 }, tower: { n: 6, rot: 0, H: 5.2 }, slab: { n: 6, rot: 0, H: 2.9 }, ring: { n: 16, rot: 0, H: 3.8 },
};
export const wrapPi = (a: number): number => { const t = Math.PI * 2, m = ((a % t) + t) % t; return m > Math.PI ? m - t : m; };

/** Corners of a regular polygon: radius R, first corner at angle rot. */
export function polygon(n: number, R: number, rot: number): [number, number][] {
  return Array.from({ length: n }, (_, k) => [Math.cos(rot + (k / n) * Math.PI * 2) * R, Math.sin(rot + (k / n) * Math.PI * 2) * R] as [number, number]);
}
/** Where the ray from the middle at `angle` meets the wall: the point, and the edge number. */
export function wallPoint(n: number, R: number, rot: number, angle: number): { x: number; z: number; edge: number } {
  const step = (Math.PI * 2) / n, inr = R * Math.cos(Math.PI / n);
  const k = ((Math.floor((angle - rot) / step) % n) + n) % n, mid = rot + (k + 0.5) * step;
  const d = inr / Math.cos(angle - mid);
  return { x: Math.cos(angle) * d, z: Math.sin(angle) * d, edge: k };
}

interface Want { slug: string | null; name: string | null; state: "open" | "locked"; kind: RoomDoor["kind"]; angle: number; key?: string }

/** The doors a room has: one to its parent, one to each child, one to each sealed room hung from it. */
function wantedDoors(hull: Hull, me: HullRoom, states: Map<number, RoomState> | null): Want[] {
  const byId = new Map(hull.rooms.map((r) => [r.id, r]));
  const out: Want[] = [];
  for (const l of hull.links) {
    if (l.from !== me.id && l.to !== me.id) continue;
    const other = byId.get(l.from === me.id ? l.to : l.from); if (!other) continue;
    const st = states?.get(other.id) ?? "unseen", open = (st === "visited" || st === "heard") && !!other.slug;
    out.push({ slug: open ? other.slug : null, name: open ? other.name : null, state: open ? "open" : "locked", kind: other.outer ? "sealed" : l.to === me.id ? "parent" : "child", angle: Math.atan2(other.z - me.z, other.x - me.x), key: open ? undefined : other.key || String(other.id) });
  }
  return out;
}

export function buildRoom(o: BuildOpts): RoomWorld {
  const me = o.hull?.rooms.find((r) => r.slug === o.slug && !r.secret) ?? null;
  const shape: Shape = me?.shape ?? "oct", { n, rot, H } = SIDES[shape];
  const want = me && o.hull ? wantedDoors(o.hull, me, o.states) : [];
  const base = me ? Math.max(me.w, me.d) / 2 : 3.4;
  const need = (want.length * (DOOR_W + GAP) * 1.15) / (n * 2 * Math.sin(Math.PI / n));
  const R = Math.max(6.2, Math.min(8, base * 1.8), need);
  const inr = R * Math.cos(Math.PI / n), E = 2 * R * Math.sin(Math.PI / n), P = n * E, hw = DOOR_W / 2;
  const verts = polygon(n, R, rot);

  // positions along the wall (0..P), as close as possible to the direction of each neighbour, at least one door apart, never across a corner
  const pos = (angle: number): number => { const w = wallPoint(n, R, rot, angle); const a = verts[w.edge], b = verts[(w.edge + 1) % n]; const t = Math.hypot(w.x - a[0], w.z - a[1]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1); return w.edge * E + t * E; };
  const items = want.map((w) => ({ w, s: pos(w.angle) })).sort((a, b) => a.s - b.s);
  const clampEdge = (s: number): number => { const k = Math.min(n - 1, Math.max(0, Math.floor(s / E))); return Math.min((k + 1) * E - hw - 0.15, Math.max(k * E + hw + 0.15, s)); };
  for (const it of items) it.s = clampEdge(it.s);
  const minGap = DOOR_W + GAP;
  for (let pass = 0; pass < 60 && items.length > 1; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      const j = (i + 1) % items.length; let gap = items[j].s - items[i].s; if (j === 0) gap += P;
      if (gap < minGap - 1e-6) { const d = (minGap - gap) / 2; items[i].s = clampEdge(((items[i].s - d) % P + P) % P); items[j].s = clampEdge(((items[j].s + d) % P + P) % P); moved = true; }
    }
    items.sort((a, b) => a.s - b.s);
    if (!moved) break;
  }
  const doors: RoomDoor[] = items.map(({ w, s }, i) => {
    const k = Math.min(n - 1, Math.floor(s / E)), t = (s - k * E) / E, a = verts[k], b = verts[(k + 1) % n];
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, mid = rot + (k + 0.5) * ((Math.PI * 2) / n);
    return { id: `d${i}`, toSlug: w.slug, name: w.name, state: w.state, kind: w.kind, x, z, nx: Math.cos(mid), nz: Math.sin(mid), tx: -Math.sin(mid), tz: Math.cos(mid), hw, edge: k, angle: Math.atan2(z, x), key: w.key };
  });

  // things to look at: one pedestal per album on a ring, a chat terminal against the emptiest wall
  const props: RoomProp[] = [];
  const shown = o.albums.slice(0, MAX_ALBUMS), seed = fnv(o.slug), ringR = inr * 0.5;
  // pedestals stand on the ring in the slots farthest from the doors, so the way to a door stays clear
  const SLOTS = Math.max(12, shown.length * 2), off = (seed % 628) / 100;
  const slotAng = (j: number): number => off + (j / SLOTS) * Math.PI * 2;
  const clearance = (j: number): number => doors.reduce((m, d) => Math.min(m, Math.abs(wrapPi(slotAng(j) - d.angle))), Math.PI);
  const picked = Array.from({ length: SLOTS }, (_, j) => j).sort((p, q) => clearance(q) - clearance(p) || p - q).slice(0, shown.length).sort((p, q) => p - q);
  shown.forEach((a, i) => { const ang = slotAng(picked[i]); props.push({ id: `a:${a.slug}`, kind: "album", x: Math.cos(ang) * ringR, z: Math.sin(ang) * ringR, r: 0.5, label: a.title, href: `/album/${a.slug}`, hue: fnv(a.slug) % 360 }); });
  if (o.albums.length > MAX_ALBUMS) props.push({ id: "more", kind: "more", x: 0, z: 0, r: 0.5, label: `All ${o.albums.length} albums`, href: `/branch/${o.slug}`, hue: 200 });
  if (o.channelSlug) {
    const used = new Set(doors.map((d) => d.edge));
    let best = 0, bestScore = -1;
    for (let k = 0; k < n; k++) { const score = (used.has(k) ? 0 : 10) + (((k + seed) % 3) === 0 ? 1 : 0); if (score > bestScore) { bestScore = score; best = k; } }
    const mid = rot + (best + 0.5) * ((Math.PI * 2) / n), d = inr - 0.9;
    props.push({ id: "terminal", kind: "terminal", x: Math.cos(mid) * d, z: Math.sin(mid) * d, r: 0.6, label: "Talk: this branch's room", href: `/topic/${o.channelSlug}`, hue: 30 });
  }

  // an inscription on a wall that has no door and no terminal
  let plaque: RoomWorld["plaque"] = null;
  {
    const usedEdges = new Set(doors.map((d) => d.edge)); const term = props.find((p) => p.kind === "terminal");
    if (term) usedEdges.add(Math.round((Math.atan2(term.z, term.x) - rot) / ((Math.PI * 2) / n) - 0.5 + n * 4) % n);
    let best = -1, bestScore = -1;
    for (let k = 0; k < n; k++) { if (usedEdges.has(k)) continue; const score = 1 + (((k + seed * 7) % 5) === 0 ? 1 : 0); if (score > bestScore) { bestScore = score; best = k; } }
    if (best >= 0) { const mid = rot + (best + 0.5) * ((Math.PI * 2) / n), d = inr - 0.04; plaque = { x: Math.cos(mid) * d, z: Math.sin(mid) * d, nx: Math.cos(mid), nz: Math.sin(mid), tx: -Math.sin(mid), tz: Math.cos(mid), edge: best }; }
  }

  // where you stand when you arrive: inside the door you came through, looking in; otherwise the middle, looking at the first door
  const via = o.from ? doors.find((d) => d.toSlug === o.from) : undefined;
  const spawn = via ? { x: via.x - via.nx * 2, z: via.z - via.nz * 2, yaw: Math.atan2(-via.nz, -via.nx) }
    : { x: 0, z: 0, yaw: doors.length ? Math.atan2(doors[0].z, doors[0].x) : 0 };
  return { slug: o.slug, name: o.name, sides: n, rot, R, inr, H, verts, doors, props, spawn, plaque, map: { x: me?.x ?? 0, z: me?.z ?? 0 } };
}
