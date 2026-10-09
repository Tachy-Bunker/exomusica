/** The dial of rooms: which rooms the dock can tune to, in what order. Pure, so the desktop rail and the phone sheet share it and it tests without a DOM. */
export interface Room { slug: string; name: string; branchSlug?: string; asleep?: boolean }
export interface Scene { name: string; slots: (Room | null)[] }
export const MAX_SCENES = 5;
export const SLOTS = 6;
export const MAX_RECENTS = 8;

const same = (a: Room | null | undefined, b: Room | null | undefined): boolean => !!a && !!b && a.slug === b.slug;
const clean = (r: Room): Room => ({ slug: r.slug, name: r.name, ...(r.branchSlug ? { branchSlug: r.branchSlug } : {}), ...(r.asleep ? { asleep: true } : {}) });

/** Most recent first, no duplicates, capped. */
export function touchRecent(recents: Room[], room: Room): Room[] {
  return [clean(room), ...recents.filter((r) => r.slug !== room.slug)].slice(0, MAX_RECENTS);
}
/** Slots are fixed positions (1..6). Pinning a room that sits in another slot moves it. */
export function pin(slots: (Room | null)[], i: number, room: Room): (Room | null)[] {
  if (i < 0 || i >= SLOTS) return slots;
  const out = Array.from({ length: SLOTS }, (_, k) => slots[k] ?? null).map((s) => (same(s, room) ? null : s));
  out[i] = clean(room); return out;
}
export function unpin(slots: (Room | null)[], i: number): (Room | null)[] {
  const out = Array.from({ length: SLOTS }, (_, k) => slots[k] ?? null); if (i >= 0 && i < SLOTS) out[i] = null; return out;
}
export const slotOf = (slots: (Room | null)[], room: Room | null): number => (room ? slots.findIndex((s) => same(s, room)) : -1);
/** First free slot, or -1. */
export const freeSlot = (slots: (Room | null)[]): number => { for (let i = 0; i < SLOTS; i++) if (!slots[i]) return i; return -1; };

/** What tuning steps through: pinned rooms in slot order, then recents that are not pinned. */
export function dialOrder(slots: (Room | null)[], recents: Room[]): Room[] {
  const pinned = slots.filter((s): s is Room => !!s);
  return [...pinned, ...recents.filter((r) => !pinned.some((p) => p.slug === r.slug))];
}
/** The next room one click away on the dial (wraps), skipping rooms put to sleep. Null when there is nowhere else to go. */
export function tune(order: Room[], currentSlug: string | null, dir: 1 | -1): Room | null {
  const live = order.filter((r) => !r.asleep || r.slug === currentSlug);
  if (live.length < 2 && !(live.length === 1 && live[0].slug !== currentSlug)) return null;
  const at = live.findIndex((r) => r.slug === currentSlug);
  if (at === -1) return live[0] ?? null;
  return live[(at + dir + live.length) % live.length];
}

/** A slot can sleep: it stays pinned but the dial steps over it. */
export function toggleSleep(slots: (Room | null)[], i: number): (Room | null)[] {
  return Array.from({ length: SLOTS }, (_, k) => { const r = slots[k] ?? null; return r && k === i ? clean({ ...r, asleep: !r.asleep }) : r; });
}

/** Scenes: a named set of six slots (a "lab night"). Same name replaces; at most MAX_SCENES. */
export function saveScene(scenes: Scene[], name: string, slots: (Room | null)[]): Scene[] {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!n || slots.every((s) => !s)) return scenes;
  const snap = Array.from({ length: SLOTS }, (_, k) => (slots[k] ? clean(slots[k]!) : null));
  const rest = scenes.filter((x) => x.name.toLowerCase() !== n.toLowerCase());
  return [{ name: n, slots: snap }, ...rest].slice(0, MAX_SCENES);
}
export const removeScene = (scenes: Scene[], name: string): Scene[] => scenes.filter((x) => x.name !== name);

/** How loud a room has been in the last half hour, 0..3, for the lamp under its slot. */
export const heat = (recent: number): 0 | 1 | 2 | 3 => (recent <= 0 ? 0 : recent < 3 ? 1 : recent < 10 ? 2 : 3);

/** What the server sent for the dial, trusted only as far as its shape. */
export function fromRemote(raw: unknown): { presets: (Room | null)[]; scenes: Scene[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { presets?: unknown; scenes?: unknown };
  const room = (r: unknown): Room | null => (r && typeof r === "object" && typeof (r as Room).slug === "string" && typeof (r as Room).name === "string" ? clean(r as Room) : null);
  const slots = (a: unknown): (Room | null)[] => Array.from({ length: SLOTS }, (_, k) => room(Array.isArray(a) ? a[k] : null));
  const scenes = (Array.isArray(o.scenes) ? o.scenes : []).filter((x): x is { name: string; slots: unknown } => !!x && typeof (x as Scene).name === "string").slice(0, MAX_SCENES).map((x) => ({ name: x.name, slots: slots(x.slots) }));
  return { presets: slots(o.presets), scenes };
}
