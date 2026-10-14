// Echoes of members: the path somebody walked in a room, kept (in memory only) so the next visitors see a faint figure retrace it.
// One recorder per live socket; when it ends, a decent walk becomes that person's echo in that room (one per person per room, a few per room).
export const SAMPLE_GAP_MS = 400, MAX_SAMPLES = 150, MIN_SAMPLES = 8, MIN_LENGTH = 4, MAX_PER_ROOM = 10, MAX_AGE_MS = 48 * 3600_000;
export interface RoomGhost { id: number; name: string; at: number; s: number[] }   // s: x,z,yaw per sample
export interface GhostOut { id: number; name: string; agoMs: number; s: number[] }
interface Rec { userId: number; name: string; room: string; s: number[]; last: number }
const r2 = (n: number): number => Math.round(n * 100) / 100;

export class GhostStore {
  private recs = new Map<number, Rec>();
  private rooms = new Map<string, RoomGhost[]>();

  begin(key: number, userId: number, name: string, room: string): void { this.recs.set(key, { userId, name, room, s: [], last: -1e12 }); }
  /** A position from a live person (the hub already vetted it). Samples are at most one per 400 ms; only the latest minute is kept. */
  sample(key: number, x: number, z: number, yaw: number, now = Date.now()): void {
    const r = this.recs.get(key); if (!r || now - r.last < SAMPLE_GAP_MS) return;
    r.last = now; r.s.push(r2(x), r2(z), r2(yaw));
    if (r.s.length > MAX_SAMPLES * 3 + 90) r.s.splice(0, r.s.length - MAX_SAMPLES * 3);
  }
  /** The socket is gone: a walk worth replaying becomes the person's echo here. */
  end(key: number, now = Date.now()): boolean {
    const r = this.recs.get(key); this.recs.delete(key); if (!r) return false;
    const n = Math.min(MAX_SAMPLES, r.s.length / 3); if (n < MIN_SAMPLES) return false;
    const s = r.s.slice(r.s.length - n * 3); let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(s[i * 3] - s[i * 3 - 3], s[i * 3 + 1] - s[i * 3 - 2]);
    if (len < MIN_LENGTH) return false;
    const list = (this.rooms.get(r.room) ?? []).filter((g) => g.id !== r.userId && now - g.at < MAX_AGE_MS);
    list.push({ id: r.userId, name: r.name, at: now, s }); list.sort((a, b) => b.at - a.at);
    this.rooms.set(r.room, list.slice(0, MAX_PER_ROOM)); return true;
  }
  /** What a person walking into the room gets to see: everyone's echo but their own, newest first. */
  forRoom(room: string, exceptUser: number, now = Date.now()): GhostOut[] {
    const list = this.rooms.get(room); if (!list) return [];
    const live = list.filter((g) => now - g.at < MAX_AGE_MS); if (live.length !== list.length) this.rooms.set(room, live);
    return live.filter((g) => g.id !== exceptUser).map((g) => ({ id: g.id, name: g.name, agoMs: now - g.at, s: g.s }));
  }
  /** Forget everything about a person (they went invisible or asked). */
  forget(userId: number): void { for (const [room, l] of this.rooms) this.rooms.set(room, l.filter((g) => g.id !== userId)); for (const r of this.recs.values()) if (r.userId === userId) r.s = []; }
  recording(): number { return this.recs.size; }
}
