// Who is standing where in the branch rooms. In memory only (nothing is stored): a room is a slug, a person is one socket.
export interface Pose { x: number; z: number; yaw: number }
export interface RoomPerson { id: number; name: string; x: number; z: number; yaw: number }
interface Member { key: number; userId: number; name: string; room: string; pose: Pose; at: number; posed: boolean }

export const MAX_PER_ROOM = 40, STALE_MS = 15_000, LIMIT = 40, MIN_GAP_MS = 80;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export class RoomHub {
  private members = new Map<number, Member>();
  private dirty = new Set<string>();
  private next = 1;

  /** Join a room: returns a key for later calls, or null when the room is full. */
  join(userId: number, name: string, room: string, now = Date.now()): number | null {
    if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(room)) return null;
    if (this.count(room) >= MAX_PER_ROOM) return null;
    const key = this.next++;
    this.members.set(key, { key, userId, name, room, pose: { x: 0, z: 0, yaw: 0 }, at: now, posed: false });
    this.dirty.add(room);
    return key;
  }
  leave(key: number): void { const m = this.members.get(key); if (!m) return; this.members.delete(key); this.dirty.add(m.room); }
  /** A new position from the person. Bad numbers are dropped, too-frequent ones too, and positions are kept inside the room. */
  pose(key: number, p: { x?: unknown; z?: unknown; yaw?: unknown }, now = Date.now()): boolean {
    const m = this.members.get(key); if (!m || !finite(p.x) || !finite(p.z) || !finite(p.yaw)) return false;
    if (m.posed && now - m.at < MIN_GAP_MS) return false;
    const x = Math.max(-LIMIT, Math.min(LIMIT, p.x)), z = Math.max(-LIMIT, Math.min(LIMIT, p.z));
    m.pose = { x, z, yaw: Math.max(-7, Math.min(7, p.yaw)) }; m.at = now; m.posed = true; this.dirty.add(m.room); return true;
  }
  count(room: string): number { let n = 0; for (const m of this.members.values()) if (m.room === room) n++; return n; }
  /** Drop people who stopped talking (closed laptop, lost signal). */
  sweep(now = Date.now()): number[] {
    const gone: number[] = [];
    for (const m of this.members.values()) if (now - m.at > STALE_MS) { gone.push(m.key); this.members.delete(m.key); this.dirty.add(m.room); }
    return gone;
  }
  /** Everyone in the room except the person asking, one entry per member (two tabs show once). Nobody who has not yet sent a position. */
  others(room: string, forKey: number): RoomPerson[] {
    const me = this.members.get(forKey), seen = new Map<number, RoomPerson>();
    for (const m of this.members.values()) {
      if (m.room !== room || m.key === forKey || !m.posed || (me && m.userId === me.userId)) continue;
      seen.set(m.userId, { id: m.userId, name: m.name, ...m.pose });
    }
    return [...seen.values()];
  }
  /** Rooms that changed since the last call (so a quiet room costs nothing). */
  takeDirty(): string[] { const d = [...this.dirty]; this.dirty.clear(); return d; }
  keysIn(room: string): number[] { return [...this.members.values()].filter((m) => m.room === room).map((m) => m.key); }
  size(): number { return this.members.size; }
}
