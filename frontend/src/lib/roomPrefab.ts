// Prefabs: a saved group of things (with the wires between them) that can be placed again anywhere. Pure data, no DOM.
import { MAX_ACTORS, MAX_WIRES, cleanDoc, emptyDoc, newId, type Actor, type RoomDoc, type Wire } from "./roomDoc";

export const PREFAB_PREFIX = "prefab~";
export const prefabKey = (name: string): string => PREFAB_PREFIX + name;
/** A name as a slug: lower case letters, digits and dashes. */
export const prefabSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** The thing `id` and everything reachable from it along wires (either direction): the natural "group". */
export function groupOf(doc: RoomDoc, id: string): Set<string> {
  const seen = new Set<string>([id]); let grew = true;
  while (grew) { grew = false; for (const w of doc.wires) { const a = seen.has(w.from), b = seen.has(w.to); if (a !== b) { seen.add(a ? w.to : w.from); grew = true; } } }
  return seen;
}
/** The prefab document for `ids`: those things, the wires between them, positions relative to their centre. */
export function makePrefab(doc: RoomDoc, ids: ReadonlySet<string>): RoomDoc {
  const acts = doc.actors.filter((a) => ids.has(a.id)); if (!acts.length) return emptyDoc();
  const cx = Math.round((acts.reduce((s, a) => s + a.x, 0) / acts.length) * 4) / 4, cz = Math.round((acts.reduce((s, a) => s + a.z, 0) / acts.length) * 4) / 4;
  return cleanDoc({ actors: acts.map((a) => ({ ...a, x: a.x - cx, z: a.z - cz })), wires: doc.wires.filter((w) => ids.has(w.from) && ids.has(w.to)) });
}
/** `prefab` placed with its centre at (x, z): fresh ids, wires remapped. Stops at the room's limits. */
export function placePrefab(doc: RoomDoc, prefab: RoomDoc, x: number, z: number): { actors: Actor[]; wires: Wire[]; added: string[] } {
  const taken = doc.actors.map((a) => a.id), map = new Map<string, string>(), added: Actor[] = [];
  for (const a of prefab.actors) {
    if (doc.actors.length + added.length >= MAX_ACTORS) break;
    const id = newId([...taken, ...added.map((q) => q.id)]); map.set(a.id, id);
    added.push({ ...a, id, x: Math.round((a.x + x) * 4) / 4, z: Math.round((a.z + z) * 4) / 4 });
  }
  const wires: Wire[] = [];
  for (const w of prefab.wires) { const f = map.get(w.from), t = map.get(w.to); if (f && t && doc.wires.length + wires.length < MAX_WIRES) wires.push({ ...w, from: f, to: t }); }
  return { actors: [...doc.actors, ...added], wires: [...doc.wires, ...wires], added: added.map((a) => a.id) };
}
