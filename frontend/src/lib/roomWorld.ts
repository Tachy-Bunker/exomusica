// The walkable room of one branch. Pure (no DOM): the footprint comes from the branch's shape on the Explore map, and every door sits in the direction of the room it leads to on that map, so walking round the room is walking round the map.
import type { Hull, HullRoom, Shape } from "./hullLayout";
import type { RoomState } from "./chart";
import type { Milestone } from "./milestones";

export interface RoomDoor {
  id: string; toSlug: string | null; name: string | null; state: "open" | "locked"; kind: "parent" | "child" | "sealed" | "milestone";
  x: number; z: number;      // middle of the door on the wall
  nx: number; nz: number;    // unit vector pointing out of the room through the door
  tx: number; tz: number;    // unit vector along the wall
  hw: number;                // half width
  edge: number; angle: number;
  /** Address hash of a sealed room hung from this door (what its scan and its note are made from). */
  key?: string;
  /** A door that stands for a community milestone. Walking into it, or using it, shows that milestone's card (unless it is an open door to another room). */
  milestone?: Milestone;
  /** A corridor's door locked by a gate not yet reached (fix406): painted amber, not grey. */
  gated?: boolean;
}
export interface RoomProp { id: string; kind: "album" | "terminal" | "computer" | "more"; x: number; z: number; r: number; label: string; href: string; hue: number }
export interface RoomWorld {
  slug: string; name: string; sides: number; rot: number; R: number; inr: number; H: number;
  verts: [number, number][]; doors: RoomDoor[]; props: RoomProp[]; spawn: { x: number; z: number; yaw: number };
  /** An inscription on one wall (scan it for the branch's text), if a wall is free. */
  plaque: { x: number; z: number; nx: number; nz: number; tx: number; tz: number; edge: number } | null;
  /** What the chat terminal's screen shows (the last few lines said in the room); set by the page. */
  chat?: string[];
  /** The branch's own description (shown when the inscription is scanned). */
  blurb?: string;
  /** Where this room lies on the Scan map (used to place the corridor and the room behind a door). */
  map: { x: number; z: number };
  /** The floor this room stands on (the hull's height, metres; a corridor to another floor is an elevator). */
  floorY?: number;
  /** The lift in this room: a pad on the floor to step onto (walkable, blocks nothing). Every room has one. */
  lift?: { x: number; z: number; r: number };
  /** A lift ride (the tube between rooms): the local x where the ride ends (the far door), and the branch it leads to. The ride is walked by the engine. */
  ride?: { to: string; end: number };
  /** Slugs of the branches above this one, nearest first (for themes); set by the page. */
  lineage?: string[];
  /** The branch's colour; set by the page once the theme is known. */
  color?: string;
}
export interface AlbumLite { slug: string; title: string }
export interface BuildOpts { hull: Hull | null; slug: string; name: string; states: Map<number, RoomState> | null; albums: AlbumLite[]; channelSlug: string | null; from?: string | null; /** the community's milestones: the Hull's host room gets the door to the Hull; every room reads the gates of its sealed doors from them */ milestones?: Milestone[] | null }

export const DOOR_W = 1.7, DOOR_H = 2.5, MAX_ALBUMS = 10;
const GAP = 0.9;
/** The Hull: a ring hall behind a door in the Core room. Its doors: one back to the Core, then one per milestone (lit once reached). The Core's door to it is locked until the Hull milestone is reached. */
export const HULL_HOST = "core", HULL_SLUG = "hull.core", HULL_KEY = "m-hull", HULL_MAX = 29;
/** A sealed room's gate when the milestone list can't be read: shown as not reached. */
const GATE_FALLBACK: Milestone = { key: "", title: "A milestone", perk: "", metric: "REACHED", label: "milestones reached", target: 1, now: 0, reached: false, reachedAt: null, live: true };
const HULL_FALLBACK: Milestone = { key: HULL_KEY, title: "Hull", perk: "The seed of the explorable ship: a corridor with one lit door per milestone reached.", metric: "REACHED", label: "milestones reached", target: 24, now: 0, reached: false, reachedAt: null, live: true };

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

interface Want { slug: string | null; name: string | null; state: "open" | "locked"; kind: RoomDoor["kind"]; angle: number; key?: string; milestone?: Milestone; gated?: boolean }

/** The direction (radians) with the most room around it, among the given directions. */
function widestGap(angles: number[]): number {
  let best = -1, at = 0;
  for (let k = 0; k < 64; k++) {
    const t = (k / 64) * Math.PI * 2, gap = angles.reduce((m, x) => Math.min(m, Math.abs(wrapPi(t - x))), Math.PI);
    if (gap > best) { best = gap; at = t; }
  }
  return at;
}

/** The doors a room has: one to its parent, one to each child, one to each sealed room hung from it. */
function wantedDoors(hull: Hull, me: HullRoom, states: Map<number, RoomState> | null, milestones: Milestone[] | null): Want[] {
  const byId = new Map(hull.rooms.map((r) => [r.id, r]));
  const out: Want[] = [];
  for (const l of hull.links) {
    if (l.from !== me.id && l.to !== me.id) continue;
    const other = byId.get(l.from === me.id ? l.to : l.from); if (!other) continue;
    const st = states?.get(other.id) ?? "unseen";
    // gates: a sealed room's gate, and a corridor's gate (fix406). Each is the milestone that must be reached before the door opens. With no list to read, a gate stays shut.
    const milestoneOf = (key: string): Milestone => milestones?.find((m) => m.key === key) ?? { ...GATE_FALLBACK, key };
    const sealed: Milestone | undefined = other.outer && other.gate ? milestoneOf(other.gate) : undefined;
    const corr: Milestone | undefined = l.corridor && l.gate ? milestoneOf(l.gate) : undefined;
    const open = (st === "visited" || st === "heard") && !!other.slug && (!sealed || sealed.reached) && (!corr || corr.reached);
    out.push({ slug: open ? other.slug : null, name: open ? other.name : null, state: open ? "open" : "locked", kind: other.outer ? "sealed" : l.corridor ? "child" : l.to === me.id ? "parent" : "child", angle: Math.atan2(other.z - me.z, other.x - me.x), key: open ? undefined : other.key || String(other.id), milestone: corr && !corr.reached ? corr : sealed ?? corr, gated: !!corr && !corr.reached });
  }
  return out;
}

/** The lift pad's radius (metres). */
export const LIFT_R = 0.9;

/** The room with its lift pad: a clear floor spot (away from the doors, the props and the spawn), off the lines you walk from the spawn to the doors. A narrow hall cannot keep off them all, so it takes the best it has. */
export function withLift(w: RoomWorld): RoomWorld {
  const walls = wallsOf(w), r = LIFT_R, inside = (x: number, z: number, m: number): boolean => walls.every((wl) => x * wl.nx + z * wl.nz <= wl.d - m);
  // the walking lines: from where you arrive to each door. A pad off them is not walked over by accident.
  const lines = w.doors.map((d) => ({ ax: w.spawn.x, az: w.spawn.z, bx: d.x, bz: d.z }));
  const lineDist = (x: number, z: number, s: { ax: number; az: number; bx: number; bz: number }): number => {
    const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
    return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
  };
  // every spot on a 0.25 m grid; a clear spot (door 2.2 m, props, spawn 2.6 m) beats any that is not, then the one farthest from the walking lines, then nearest the middle
  const step = 0.25, span = Math.ceil(w.R / step);
  let best: { x: number; z: number; r: number } = { x: 0, z: 0, r }, bestScore = -Infinity;
  for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
    const x = i * step, z = j * step;
    if (!inside(x, z, r + 0.4)) continue;
    const dDoor = Math.min(99, ...w.doors.map((d) => Math.hypot(d.x - x, d.z - z)));
    const dProp = Math.min(99, ...w.props.map((p) => Math.hypot(p.x - x, p.z - z) - p.r));
    const dSpawn = Math.hypot(w.spawn.x - x, w.spawn.z - z);
    const dLine = Math.min(3, ...lines.map((l) => lineDist(x, z, l)));
    const clear = (dDoor >= 2.2 ? 1 : 0) + (dProp >= r + 1.0 ? 1 : 0) + (dSpawn >= 2.6 ? 1 : 0);
    const score = clear * 10 + dLine * 2 - Math.hypot(x, z) * 0.2;
    if (score > bestScore) { bestScore = score; best = { x, z, r }; }
  }
  return { ...w, lift: best };
}

/** The ride's tube: its length, half-width and height (metres). */
export const LIFT_LEN = 18, LIFT_HW = 1.3, LIFT_H = 3.2;
/** The lift's ride: a tube from the pad you stepped onto to its far end, where a door leads to the branch you chose. The engine walks it; you only look. */
export function buildLiftRoom(o: { from: RoomWorld; to: string; name: string }): RoomWorld {
  const L = LIFT_LEN, W = LIFT_HW;
  const verts: [number, number][] = [[-L, -W], [L, -W], [L, W], [-L, W]]; // counter-clockwise, as the other rooms
  const far: RoomDoor = { id: "far", toSlug: o.to, name: o.name, state: "open", kind: "child", x: L, z: 0, nx: 1, nz: 0, tx: 0, tz: 1, hw: DOOR_W / 2, edge: 1, angle: 0 };
  return { slug: `lift.${o.from.slug}.${o.to}`, name: "Lift", sides: 4, rot: 0, R: Math.hypot(L, W), inr: W, H: LIFT_H, verts, doors: [far], props: [], spawn: { x: -L + 2.5, z: 0, yaw: 0 }, plaque: null, map: o.from.map, floorY: o.from.floorY ?? 0, ride: { to: o.to, end: L - 1.2 } };
}

export function buildRoom(o: BuildOpts): RoomWorld {
  const me = o.hull?.rooms.find((r) => r.slug === o.slug && !r.secret) ?? null;
  const shape: Shape = me?.shape ?? "oct", { n, rot, H } = SIDES[shape];
  const want: Want[] = me && o.hull ? wantedDoors(o.hull, me, o.states, o.milestones ?? null) : [];
  if (o.slug === HULL_HOST && o.milestones) { // the door to the Hull, in the widest gap between the other doors
    const hm = o.milestones.find((m) => m.key === HULL_KEY) ?? HULL_FALLBACK;
    want.push({ slug: HULL_SLUG, name: hm.reached ? "The Hull" : null, state: hm.reached ? "open" : "locked", kind: "child", angle: widestGap(want.map((w) => w.angle)), milestone: hm });
  }
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
  let own = 0; // the room's own doors are d0, d1, ... in wall order; the Hull's door is "hull", so adding it moves no other id
  const doors: RoomDoor[] = items.map(({ w, s }) => {
    const k = Math.min(n - 1, Math.floor(s / E)), t = (s - k * E) / E, a = verts[k], b = verts[(k + 1) % n];
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, mid = rot + (k + 0.5) * ((Math.PI * 2) / n);
    return { id: w.slug === HULL_SLUG ? "hull" : `d${own++}`, toSlug: w.slug, name: w.name, state: w.state, kind: w.kind, x, z, nx: Math.cos(mid), nz: Math.sin(mid), tx: -Math.sin(mid), tz: Math.cos(mid), hw, edge: k, angle: Math.atan2(z, x), key: w.key, milestone: w.milestone, gated: w.gated };
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

  // the site computer: a screen that opens this branch's pages. It stands on the wall spot furthest from the doors and the Talk terminal, and only where it clears them,
  // so no walk to a door is blocked. If no spot clears, the room has no computer (the logbook still lists the site).
  const stepA = (Math.PI * 2) / n;
  const edgeOf = (p: RoomProp): number => ((Math.floor((Math.atan2(p.z, p.x) - rot) / stepA + 1e-6) % n) + n) % n;
  {
    const term = props.find((p) => p.kind === "terminal");
    let spot: { x: number; z: number } | null = null, bestGap = -Infinity;
    for (let k = 0; k < n; k++) for (const t of [0.25, 0.5, 0.75]) {
      const mid = rot + (k + t) * stepA, d = inr - 0.9, x = Math.cos(mid) * d, z = Math.sin(mid) * d;
      let gap = Infinity;
      for (const dr of doors) gap = Math.min(gap, Math.hypot(x - dr.x, z - dr.z) - 0.6);
      if (term) gap = Math.min(gap, Math.hypot(x - term.x, z - term.z) - 1.2);
      if (gap > bestGap) { bestGap = gap; spot = { x, z }; }
    }
    if (spot && bestGap >= 1.2) props.push({ id: "computer", kind: "computer", x: spot.x, z: spot.z, r: 0.6, label: "Site: this branch's pages", href: `/branch/${o.slug}`, hue: 190 });
  }

  // an inscription on a wall that has no door and no terminal or computer
  let plaque: RoomWorld["plaque"] = null;
  {
    const usedEdges = new Set(doors.map((d) => d.edge));
    for (const p of props) if (p.kind === "terminal" || p.kind === "computer") usedEdges.add(edgeOf(p));
    let best = -1, bestScore = -1;
    for (let k = 0; k < n; k++) { if (usedEdges.has(k)) continue; const score = 1 + (((k + seed * 7) % 5) === 0 ? 1 : 0); if (score > bestScore) { bestScore = score; best = k; } }
    if (best >= 0) { const mid = rot + (best + 0.5) * ((Math.PI * 2) / n), d = inr - 0.04; plaque = { x: Math.cos(mid) * d, z: Math.sin(mid) * d, nx: Math.cos(mid), nz: Math.sin(mid), tx: -Math.sin(mid), tz: Math.cos(mid), edge: best }; }
  }

  // where you stand when you arrive: inside the door you came through, looking in; otherwise the middle, looking at the first door
  const via = o.from ? doors.find((d) => d.toSlug === o.from) : undefined;
  const spawn = via ? { x: via.x - via.nx * 2, z: via.z - via.nz * 2, yaw: Math.atan2(-via.nz, -via.nx) }
    : { x: 0, z: 0, yaw: doors.length ? Math.atan2(doors[0].z, doors[0].x) : 0 };
  return withLift({ slug: o.slug, name: o.name, sides: n, rot, R, inr, H, verts, doors, props, spawn, plaque, map: { x: me?.x ?? 0, z: me?.z ?? 0 }, floorY: me?.y ?? 0 });
}

/** A wall of a room: its outward unit normal (nx, nz) and the distance from the middle to it along that normal. */
/** A wall as a line (outward normal n, distance d) plus, when built from corners, its segment: start a, unit direction t, length len. */
export interface Wall { nx: number; nz: number; d: number; ax?: number; az?: number; tx?: number; tz?: number; len?: number }
const wallCache = new WeakMap<RoomWorld, Wall[]>();
/** The walls of a room: from its corners when it has them (any convex room, a regular ring or a straight hall), else from its regular shape. Cached per room. */
export function wallsOf(w: RoomWorld): Wall[] {
  const hit = wallCache.get(w); if (hit) return hit;
  const out: Wall[] = [];
  if (w.sides >= 3 && w.verts.length === w.sides) { // corners counter-clockwise: each side's outward normal is its direction turned clockwise
    for (let k = 0; k < w.sides; k++) {
      const a = w.verts[k], b = w.verts[(k + 1) % w.sides], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1;
      const nx = ez / L, nz = -ex / L; out.push({ nx, nz, d: nx * a[0] + nz * a[1], ax: a[0], az: a[1], tx: ex / L, tz: ez / L, len: L });
    }
  } else for (let k = 0; k < w.sides; k++) { const a = w.rot + (k + 0.5) * ((Math.PI * 2) / w.sides); out.push({ nx: Math.cos(a), nz: Math.sin(a), d: w.inr }); }
  wallCache.set(w, out); return out;
}

/** The Hull: a straight hall, its length along the way from the Core. Each side wall is cut into segments one door-and-a-bit wide; the milestones alternate sides, one door per segment,
 *  so both walls carry doors. The back door is in the near end wall, facing the Core. */
export const HULL_HALF_W = 2.4, HULL_SEG = DOOR_W + 0.9;
export function buildHullRoom(o: { core: RoomWorld; door: RoomDoor; milestones: Milestone[] }): RoomWorld {
  const ms = o.milestones.slice(0, HULL_MAX), K = Math.max(1, Math.ceil(ms.length / 2)), Lh = (K * HULL_SEG) / 2, Wh = HULL_HALF_W;
  const th = Math.atan2(o.door.nz, o.door.nx), c = Math.cos(th), s = Math.sin(th);
  const turn = (x: number, z: number): [number, number] => [x * c - z * s, x * s + z * c]; // from the hall's own frame (its near end on -x) into the map's
  // corners, counter-clockwise: the bottom wall (-z) in K segments, the far end, the top wall (+z) back in K segments, then the near end (-x)
  const loc: [number, number][] = [];
  for (let j = 0; j <= K; j++) loc.push([-Lh + j * HULL_SEG, -Wh]);
  loc.push([Lh, Wh]);
  for (let j = K - 1; j >= 0; j--) loc.push([-Lh + j * HULL_SEG, Wh]);
  const verts = loc.map(([x, z]) => turn(x, z));
  // a door in the hall's frame, turned into the map's: position, outward normal, along the wall; `edge` is its wall's number (the corners' order above)
  const at = (x: number, z: number, nx: number, nz: number, tx: number, tz: number, edge: number) => {
    const [px, pz] = turn(x, z), [qx, qz] = turn(nx, nz), [rx, rz] = turn(tx, tz);
    return { x: px, z: pz, nx: qx, nz: qz, tx: rx, tz: rz, hw: DOOR_W / 2, edge, angle: Math.atan2(pz, px) };
  };
  const doors: RoomDoor[] = [{ id: "back", toSlug: o.core.slug, name: o.core.name, state: "open", kind: "parent", ...at(-Lh, 0, -1, 0, 0, 1, 2 * K + 1) }];
  ms.forEach((m, i) => {
    const seg = Math.floor(i / 2), xc = -Lh + (seg + 0.5) * HULL_SEG;
    const f = i % 2 === 0 ? at(xc, -Wh, 0, -1, 1, 0, seg) : at(xc, Wh, 0, 1, 1, 0, 2 * K - seg);
    doors.push({ id: `m${i}`, toSlug: null, name: m.title, state: m.reached ? "open" : "locked", kind: "milestone", ...f, milestone: m });
  });
  const f0 = doors[0], spawn = { x: f0.x - f0.nx * 2, z: f0.z - f0.nz * 2, yaw: Math.atan2(-f0.nz, -f0.nx) }; // in front of the back door, looking in
  // the hall's middle lies a unit beyond the Core's door, so the corridor between them is short (only the direction matters to the link)
  const map = { x: o.core.map.x + o.door.nx, z: o.core.map.z + o.door.nz };
  return withLift({ slug: HULL_SLUG, name: "The Hull", sides: verts.length, rot: 0, R: Math.hypot(Lh, Wh), inr: Wh, H: 4.2, verts, doors, props: [], spawn, plaque: null, map, floorY: o.core.floorY ?? 0 });
}
