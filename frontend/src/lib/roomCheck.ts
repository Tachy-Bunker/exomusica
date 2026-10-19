// Map checks (P7): what would stop a visitor, or a saved room, from working. Pure: the admin map feeds it the hull, the stored links, the milestones and each room's stored document (not the cleaned copy, which drops what is wrong without a word).
import { EVENTS, GATE, MAX_ACTORS, MAX_WIRES, MESSAGES, type RoomDoc } from "./roomDoc";
import { alignedDocks, type Hull, type MapLink } from "./hullLayout";
import { buildRoom, wallsOf } from "./roomWorld";
import type { Milestone } from "./milestones";

export type CheckLevel = "error" | "warn" | "info";
export interface CheckIssue { level: CheckLevel; room: string | null; text: string }
export interface CheckInput {
  hull: Hull;
  links: readonly MapLink[];
  milestones: readonly Milestone[];
  /** stored documents by room slug; null when a room has none */
  docs: ReadonlyMap<string, RoomDoc | null>;
}
/** A cap warns from this share of its size. */
export const NEAR_CAP = 0.9;
/** A wall-mounted actor sits a little off the wall; this is how far it may sit outside before it counts. */
const WALL_SLACK = 0.3;
const RANK: Record<CheckLevel, number> = { error: 0, warn: 1, info: 2 };

/** Every problem on the map, errors first. A room with no stored document is not checked for its content. */
export function checkMap(input: CheckInput): CheckIssue[] {
  const out: CheckIssue[] = [];
  const rooms = input.hull.rooms, byId = new Map(rooms.map((r) => [r.id, r])), bySlug = new Map(rooms.map((r) => [r.slug, r]));
  const keys = new Set(input.milestones.map((m) => m.key)), haveKeys = input.milestones.length > 0;
  const gate = (key: string, room: string | null, what: string): void => {
    if (!key || !haveKeys || keys.has(key)) return;
    out.push({ level: "error", room, text: `${what} waits for "${key}", which is not a milestone: it never opens` });
  };

  // links: where they point, and their gates
  for (const l of input.links) {
    const missing = [l.fromSlug, l.toSlug].filter((s) => !bySlug.has(s));
    if (missing.length) out.push({ level: "error", room: l.fromSlug, text: `${l.kind === "lift" ? "Lift" : "Corridor"} to ${missing.join(", ")}, which is not on the map` });
    gate(l.gate, l.fromSlug, `The ${l.kind === "lift" ? "lift" : "corridor"} to ${l.toSlug}`);
  }

  // walk paths from the Core: tree and corridor links on the hull, and lift destinations that are on the map
  const adj = new Map<string, Set<string>>(), join = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set()); adj.get(a)!.add(b); adj.get(b)!.add(a);
  };
  for (const l of input.hull.links) { const a = byId.get(l.from), b = byId.get(l.to); if (a && b) join(a.slug, b.slug); }
  for (const l of input.links) if (bySlug.has(l.fromSlug) && bySlug.has(l.toSlug)) join(l.fromSlug, l.toSlug);
  if (!bySlug.has("core")) out.push({ level: "error", room: null, text: "There is no Core room on the map: nothing can be reached" });
  else {
    const seen = new Set<string>(["core"]), queue = ["core"];
    while (queue.length) for (const n of adj.get(queue.shift()!) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    for (const r of rooms) if (!seen.has(r.slug)) out.push({ level: "error", room: r.slug, text: "No walk path from the Core: no door, corridor or lift reaches it" });
  }

  // sealed rooms: each needs a gate, and the gate must be a milestone
  for (const r of rooms) {
    if (!r.secret && !r.outer) continue;
    if (!r.gate) out.push({ level: "warn", room: r.slug, text: "Sealed room with no gate: nothing holds its door shut" });
    gate(r.gate, r.slug, `The sealed room ${r.name}`);
  }

  // two rooms whose walls meet, with no link between them: the map shows a wall, but no door
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    if (Math.abs(a.y - b.y) > 0.01 || adj.get(a.slug)?.has(b.slug)) continue;
    if (alignedDocks(a, b)) out.push({ level: "info", room: a.slug, text: `${a.name} and ${b.name} share a wall but are not linked: add a corridor, or move them apart` });
  }

  // each room's stored document
  for (const r of rooms) {
    const doc = input.docs.get(r.slug); if (!doc) continue;
    const actors = Array.isArray(doc.actors) ? doc.actors : [], wires = Array.isArray(doc.wires) ? doc.wires : [];
    if (actors.length > MAX_ACTORS) out.push({ level: "error", room: r.slug, text: `${actors.length} actors: the room keeps ${MAX_ACTORS}; the rest are dropped on load` });
    else if (actors.length >= NEAR_CAP * MAX_ACTORS) out.push({ level: "warn", room: r.slug, text: `${actors.length} of ${MAX_ACTORS} actors: near the cap` });
    if (wires.length > MAX_WIRES) out.push({ level: "error", room: r.slug, text: `${wires.length} wires: the room keeps ${MAX_WIRES}; the rest are dropped on load` });
    else if (wires.length >= NEAR_CAP * MAX_WIRES) out.push({ level: "warn", room: r.slug, text: `${wires.length} of ${MAX_WIRES} wires: near the cap` });

    const byActor = new Map(actors.map((a) => [a.id, a]));
    for (const w of wires) {
      const f = byActor.get(w.from), t = byActor.get(w.to);
      if (!f || !t) { out.push({ level: "error", room: r.slug, text: `A wire joins ${f ? w.to : w.from}, which is not an actor in this room` }); continue; }
      if (!EVENTS[f.kind]?.includes(w.ev)) out.push({ level: "error", room: r.slug, text: `A wire on "${f.name}" uses the event "${w.ev}", which a ${f.kind} does not have` });
      if (!MESSAGES[t.kind]?.includes(w.msg)) out.push({ level: "error", room: r.slug, text: `A wire to "${t.name}" sends "${w.msg}", which a ${t.kind} does not take` });
    }
    for (const a of actors) if (a.gate && !GATE.test(a.gate)) out.push({ level: "error", room: r.slug, text: `"${a.name}" has the gate "${a.gate}", which is not a milestone key` });
    for (const a of actors) if (a.gate && GATE.test(a.gate)) gate(a.gate, r.slug, `"${a.name}"`);

    // actors outside the room's walls
    if (actors.length) {
      const walls = wallsOf(buildRoom({ hull: input.hull, slug: r.slug, name: r.name, states: null, albums: [], channelSlug: null, milestones: null }));
      const outside = actors.filter((a) => walls.some((wl) => a.x * wl.nx + a.z * wl.nz > wl.d + WALL_SLACK)).map((a) => a.name);
      if (outside.length) out.push({ level: "warn", room: r.slug, text: `${outside.length} actor${outside.length > 1 ? "s stand" : " stands"} outside the walls: ${outside.slice(0, 3).join(", ")}${outside.length > 3 ? "…" : ""}` });
    }
  }
  return out.sort((p, q) => RANK[p.level] - RANK[q.level]);
}

/** Counts by level, for the panel's heading. */
export const countChecks = (list: readonly CheckIssue[]) => ({ error: list.filter((c) => c.level === "error").length, warn: list.filter((c) => c.level === "warn").length, info: list.filter((c) => c.level === "info").length });
