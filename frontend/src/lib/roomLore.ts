// What can be scanned in a room, the note a sealed door answers with, and the logbook that remembers it. Pure (storage is guarded).
import type { RoomWorld } from "./roomWorld";

export type ScanWhat = "wall" | "door" | "seal" | "terminal" | "album" | "artifact";
export interface Scannable {
  /** The scan address (kind "lore"): branch:slug, album:slug, room:slug/terminal, room:slug/door/other, room:slug/seal/hash. */
  key: string; what: ScanWhat;
  /** Same id the lock-on uses for this thing: a door id, a prop id or "plaque". */
  id: string; lockKind: "door" | "prop" | "plaque" | "artifact";
  label: string; text: string; x: number; y: number; z: number;
}

/** The part of an owner-placed artifact the scanner needs. */
export interface ArtifactLike { id: string; name: string; text: string; lore: string; mode: number; x: number; z: number }
/** Everything in the room that can be scanned, with the text shown when it is (the owner's lore replaces this text when there is some). */
export function scannables(w: RoomWorld, arts: readonly ArtifactLike[] = []): Scannable[] {
  const out: Scannable[] = [];
  for (const a of arts) out.push({ key: `room:${w.slug}/artifact/${a.id}`, what: "artifact", id: a.id, lockKind: "artifact", label: a.name || "Artifact", text: a.lore.trim() || a.text.trim() || "Something left here. It has no words.", x: a.x, y: a.mode === 1 ? 0.3 : 1.3, z: a.z });
  if (w.plaque) out.push({ key: `branch:${w.slug}`, what: "wall", id: "plaque", lockKind: "plaque", label: "Inscription", text: w.blurb?.trim() || `${w.name}. Nobody has written anything on this wall yet.`, x: w.plaque.x, y: 1.6, z: w.plaque.z });
  for (const p of w.props) {
    if (p.kind === "terminal") out.push({ key: `room:${w.slug}/terminal`, what: "terminal", id: p.id, lockKind: "prop", label: "Terminal", text: `A terminal wired to ${w.name}'s room chat. Whatever is said here is kept, day by day.`, x: p.x, y: 1.3, z: p.z });
    else if (p.kind === "album") out.push({ key: `album:${p.id.slice(2)}`, what: "album", id: p.id, lockKind: "prop", label: p.label, text: `Pedestal: the album "${p.label}". Its disc can be read from the screen.`, x: p.x, y: 1.3, z: p.z });
  }
  for (const d of w.doors) {
    if (d.state === "open" && d.toSlug) out.push({ key: `room:${w.slug}/door/${d.toSlug}`, what: "door", id: d.id, lockKind: "door", label: `Door: ${d.name}`, text: `A door to ${d.name}. The corridor beyond follows the line of the scan map.`, x: d.x, y: 1.25, z: d.z });
    else { const sig = signature(d.key ?? d.id); out.push({ key: `room:${w.slug}/seal/${d.key ?? d.id}`, what: "seal", id: d.id, lockKind: "door", label: "Sealed door", text: `Sealed. Something is behind it, and it rings at ${sig.note} (${Math.round(sig.freq)} Hz).`, x: d.x, y: 1.25, z: d.z }); }
  }
  return out;
}

// ---- the note a sealed door answers with: fixed by its address, so it is the same for everyone and every visit
const SEMI = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export interface Signature { freq: number; note: string; hue: number }
export function signature(key: string): Signature {
  let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } h >>>= 0;
  const midi = 55 + SEMI[h % SEMI.length]; // from G3, pentatonic over three octaves, so any two doors sound well together
  return { freq: 440 * Math.pow(2, (midi - 69) / 12), note: `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`, hue: (h >>> 8) % 360 };
}

export interface Lore { title: string; body: string }
export interface ShownLore { title: string; text: string; owner: boolean }
/** What the logbook says about a scanned thing: the owner's lore when there is some, else the plain description. */
export function shownOf(s: Pick<Scannable, "key" | "label" | "text">, lore: ReadonlyMap<string, Lore> | null): ShownLore {
  const l = lore?.get(s.key);
  return l ? { title: l.title, text: l.body, owner: true } : { title: s.label, text: s.text, owner: false };
}

// ---- the logbook (on this device; the scans themselves also go to the account like any other scan)
const ROOMS_KEY = "exomusica_logbook_rooms", LOG_KEY = "exomusica_logbook";
export interface LogRoom { name: string; items: { key: string; what: ScanWhat; label: string }[] }
export interface LogEntry { key: string; room: string; title: string; text: string; owner: boolean; at: number }
const read = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v ?? d; } catch { return d; } };
const write = (k: string, v: unknown): void => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export const loadRooms = (): Record<string, LogRoom> => read(ROOMS_KEY, {} as Record<string, LogRoom>);
/** Remember what a room holds, so the logbook can say how much of it is still unread. */
export function noteRoom(w: RoomWorld, list: Scannable[]): void {
  const all = loadRooms(); all[w.slug] = { name: w.name, items: list.map((s) => ({ key: s.key, what: s.what, label: s.what === "seal" ? "Sealed door" : s.label })) };
  const keys = Object.keys(all); if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete all[k];
  write(ROOMS_KEY, all);
}
export const loadLog = (): Record<string, LogEntry> => read(LOG_KEY, {} as Record<string, LogEntry>);
export function addLog(e: LogEntry): void {
  const all = loadLog(); all[e.key] = e;
  const keys = Object.keys(all); if (keys.length > 600) for (const k of keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 600)) delete all[k];
  write(LOG_KEY, all);
}

export interface RoomStat { slug: string; name: string; done: number; total: number; pct: number }
export interface Completion { rooms: RoomStat[]; done: number; total: number; pct: number }
/** How much of the rooms you have been in is scanned. `scanned` holds the scan ids ("lore|key"). */
export function completion(rooms: Record<string, LogRoom>, scanned: ReadonlySet<string>): Completion {
  const out: RoomStat[] = []; let done = 0, total = 0;
  for (const [slug, r] of Object.entries(rooms)) {
    const d = r.items.filter((i) => scanned.has(`lore|${i.key}`)).length;
    out.push({ slug, name: r.name, done: d, total: r.items.length, pct: r.items.length ? Math.floor((d / r.items.length) * 100) : 0 }); done += d; total += r.items.length;
  }
  out.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
  return { rooms: out, done, total, pct: total ? Math.floor((done / total) * 100) : 0 };
}
