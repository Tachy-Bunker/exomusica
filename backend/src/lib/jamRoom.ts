// A jam room is a tiny shared pattern: 4 lanes x 16 steps plus tempo, key and scale. Only this state is shared - every browser makes its own sound,
// so the server never touches audio. Rooms live in memory and vanish when empty.

export const LANES = 4; // kick, hat, bass, lead
export const STEPS = 16;
export const MAX_MEMBERS = 6;
export const BIG_MEMBERS = 8; // once the community reaches Jam grows
export const MAX_ROOMS = 40;
export const SCALES = ["minor-pent", "dorian", "whole-tone", "phrygian-dom", "just-7"] as const;
export type ScaleId = (typeof SCALES)[number];

export interface JamState { tempo: number; root: number; scale: ScaleId; swing: number; steps: number[][]; muted: boolean[]; epoch: number }
export type JamOp =
  | { t: "step"; lane: number; step: number; v: number }
  | { t: "tempo"; v: number }
  | { t: "root"; v: number }
  | { t: "scale"; v: string }
  | { t: "swing"; v: number }
  | { t: "mute"; lane: number; v: boolean }
  | { t: "clear"; lane: number };

const int = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const inRange = (n: number, a: number, b: number) => n >= a && n <= b;

export function defaultState(now: number): JamState {
  const steps = Array.from({ length: LANES }, () => Array<number>(STEPS).fill(0));
  for (const s of [0, 4, 8, 12]) steps[0][s] = 1;
  for (const s of [2, 6, 10, 14]) steps[1][s] = 1;
  return { tempo: 100, root: 110, scale: "minor-pent", swing: 0, steps, muted: [false, false, false, false], epoch: now };
}

/** Lanes 0-1 are on/off; lanes 2-3 hold a scale degree 0 (rest) to 8. */
export const maxValue = (lane: number): number => (lane <= 1 ? 1 : 8);

/** Applies one change, or returns null when it is not valid (unknown lane, step out of range, tempo outside 50-200...). Never mutates the input. */
export function applyOp(s: JamState, op: unknown, now: number): JamState | null {
  if (!op || typeof op !== "object") return null;
  const o = op as Record<string, unknown>;
  switch (o.t) {
    case "step": {
      if (!int(o.lane) || !int(o.step) || !int(o.v) || !inRange(o.lane, 0, LANES - 1) || !inRange(o.step, 0, STEPS - 1) || !inRange(o.v, 0, maxValue(o.lane))) return null;
      return { ...s, steps: s.steps.map((row, i) => (i === o.lane ? row.map((x, j) => (j === o.step ? (o.v as number) : x)) : row)) };
    }
    case "tempo": // a new tempo restarts the shared count so everyone's bar one lines up again
      return int(o.v) && inRange(o.v, 50, 200) ? { ...s, tempo: o.v, epoch: now } : null;
    case "root": return num(o.v) && inRange(o.v, 40, 400) ? { ...s, root: Math.round(o.v * 100) / 100 } : null;
    case "scale": return typeof o.v === "string" && (SCALES as readonly string[]).includes(o.v) ? { ...s, scale: o.v as ScaleId } : null;
    case "swing": return num(o.v) && inRange(o.v, 0, 0.6) ? { ...s, swing: Math.round(o.v * 100) / 100 } : null;
    case "mute": return int(o.lane) && inRange(o.lane, 0, LANES - 1) && typeof o.v === "boolean" ? { ...s, muted: s.muted.map((m, i) => (i === o.lane ? (o.v as boolean) : m)) } : null;
    case "clear": return int(o.lane) && inRange(o.lane, 0, LANES - 1) ? { ...s, steps: s.steps.map((row, i) => (i === o.lane ? Array<number>(STEPS).fill(0) : row)) } : null;
    default: return null;
  }
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L: easy to read out loud
export function newCode(rand: () => number = Math.random): string {
  return Array.from({ length: 4 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");
}
export const normalizeCode = (s: unknown): string | null => (typeof s === "string" && /^[A-Za-z2-9]{4}$/.test(s) && !/[ILOilo]/.test(s) ? s.toUpperCase() : null);

/** Allows `limit` messages per `windowMs` per sender: a flood of step changes can't turn into a flood of broadcasts. */
export class Throttle {
  private hits: number[] = [];
  constructor(private limit = 40, private windowMs = 1000) {}
  allow(now: number): boolean {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.limit) return false;
    this.hits.push(now);
    return true;
  }
}

export interface Member { id: number; username: string }
export class JamRooms<S> {
  /** How many people a room holds. Raised by the milestone; rooms already over a lowered limit are left alone, new people just can't join. */
  limit = MAX_MEMBERS;
  rooms = new Map<string, { state: JamState; members: Map<S, Member>; emptySince: number | null; listed: boolean; chat: ChatLine[] }>();
  constructor(private now: () => number = Date.now, private rand: () => number = Math.random) {}

  create(listed = true): string | null {
    this.sweep();
    if (this.rooms.size >= MAX_ROOMS) return null;
    let code = newCode(this.rand);
    for (let i = 0; i < 20 && this.rooms.has(code); i++) code = newCode(this.rand);
    if (this.rooms.has(code)) return null;
    this.rooms.set(code, { state: defaultState(this.now()), members: new Map(), emptySince: this.now(), listed, chat: [] });
    return code;
  }
  join(code: string, sock: S, m: Member): "ok" | "missing" | "full" {
    const r = this.rooms.get(code);
    if (!r) return "missing";
    if (r.members.size >= this.limit && !r.members.has(sock)) return "full";
    r.members.set(sock, m); r.emptySince = null;
    return "ok";
  }
  leave(code: string, sock: S): void {
    const r = this.rooms.get(code);
    if (!r) return;
    r.members.delete(sock);
    if (r.members.size === 0) r.emptySince = this.now();
  }
  /** The public list: rooms that chose to be listed and have someone in them, fullest first. */
  list(): { code: string; people: number; max: number; tempo: number; full: boolean }[] {
    const out: { code: string; people: number; max: number; tempo: number; full: boolean }[] = [];
    for (const [code, r] of this.rooms) if (r.listed && r.members.size > 0) out.push({ code, people: r.members.size, max: this.limit, tempo: r.state.tempo, full: r.members.size >= this.limit });
    return out.sort((a, b) => b.people - a.people || a.code.localeCompare(b.code)).slice(0, 30);
  }
  /** Rooms empty for more than ten minutes are dropped. */
  sweep(): void {
    for (const [c, r] of this.rooms) if (r.emptySince !== null && this.now() - r.emptySince > 600_000) this.rooms.delete(c);
  }
}

// --- Public rooms: guests, the side chat, and cursors ------------------------

export interface ChatLine { by: string; text: string; at: number }
export const CHAT_KEEP = 40;
export const CHAT_MAX = 300;

/** A guest's name in a room: guest-1234, never one already in use there. */
export function guestName(taken: Iterable<string>, rand: () => number = Math.random): string {
  const used = new Set(taken);
  for (let i = 0; i < 50; i++) { const n = `guest-${String(Math.floor(rand() * 10000)).padStart(4, "0")}`; if (!used.has(n)) return n; }
  return `guest-${Date.now() % 100000}`;
}

/** One chat line: plain text only, whitespace tidied, capped; null when nothing is left. */
export function cleanChat(text: unknown): string | null {
  if (typeof text !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const t = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
  return t || null;
}

export function pushChat(chat: ChatLine[], line: ChatLine): void {
  chat.push(line);
  if (chat.length > CHAT_KEEP) chat.splice(0, chat.length - CHAT_KEEP);
}

/** A pointer position as fractions of the room's box (a little outside it is fine); null if it isn't two finite numbers. */
export function cleanCursor(x: unknown, y: unknown): { x: number; y: number } | null {
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const c = (n: number) => Math.round(Math.max(-0.2, Math.min(1.2, n)) * 1000) / 1000;
  return { x: c(x), y: c(y) };
}
