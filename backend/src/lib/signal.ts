/** The numbers station: a fantasy calendar (dates, never time of day), salted-hash answers, and the rules for what is on the air for whom. Pure. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// ---- calendar: 13 months of 28 days + a Null Day = 365. Counted from the station's first day, not from anything real-world.
export const EPOCH_MS = Date.UTC(2026, 0, 1);
export const MONTHS = ["Static", "Drift", "Carrier", "Sideband", "Squelch", "Heterodyne", "Overtone", "Formant", "Aliasing", "Phase", "Grain", "Decay", "Silence"] as const;
export const YEAR_DAYS = 365;

export const dayIndex = (now: number = Date.now()): number => Math.floor((now - EPOCH_MS) / 86_400_000);
export interface StationDate { cycle: number; month: number | null; day: number; label: string }
export function stationDate(idx: number): StationDate {
  const cycle = Math.floor(idx / YEAR_DAYS) + 1;
  const d = ((idx % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  if (d === 364) return { cycle, month: null, day: 0, label: `Null Day, Cycle ${cycle}` };
  const month = Math.floor(d / 28);
  return { cycle, month, day: (d % 28) + 1, label: `${(d % 28) + 1} ${MONTHS[month]}, Cycle ${cycle}` };
}
/** Cycle (1+), month (0-12, or null for the Null Day), day (1-28) back to a day index. */
export function indexOfDate(cycle: number, month: number | null, day: number): number | null {
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > 999) return null;
  if (month === null) return (cycle - 1) * YEAR_DAYS + 364;
  if (!Number.isInteger(month) || month < 0 || month > 12 || !Number.isInteger(day) || day < 1 || day > 28) return null;
  return (cycle - 1) * YEAR_DAYS + month * 28 + day - 1;
}

// ---- answers: normalised, salted, hashed. The hash never leaves the server.
export function normalizeAnswer(a: string): string {
  return String(a ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export const newSalt = (): string => randomBytes(12).toString("hex");
export const hashAnswer = (salt: string, answer: string): string => createHash("sha256").update(`${salt}:${normalizeAnswer(answer)}`).digest("hex");
export function checkAnswer(salt: string, hash: string, answer: string): boolean {
  if (!normalizeAnswer(answer)) return false;
  const a = Buffer.from(hashAnswer(salt, answer), "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- the graph
export interface NodeRules { id: number; published: boolean; opensOnDay: number | null; requires: number[]; quorum: number }
/** What is on the air for this member: published, its day has come, and every requirement is met. A requirement with a quorum is met once enough
 *  different members have solved it (for everyone); any other is met by the member's own solve. */
export function isOnAir(n: NodeRules, byId: Map<number, NodeRules>, today: number, mySolved: Set<number>, solveCount: Map<number, number>): boolean {
  if (!n.published) return false;
  if (n.opensOnDay !== null && today < n.opensOnDay) return false;
  return n.requires.every((rid) => {
    const r = byId.get(rid);
    if (!r) return false;
    return r.quorum > 0 ? (solveCount.get(rid) ?? 0) >= r.quorum : mySolved.has(rid);
  });
}
/** true if giving `id` these requirements would make the graph loop back on itself. */
export function wouldLoop(id: number, requires: number[], all: { id: number; requires: number[] }[]): boolean {
  const reqs = new Map(all.map((n) => [n.id, n.requires]));
  reqs.set(id, requires);
  const seen = new Set<number>();
  const walk = (x: number): boolean => { if (x === id && seen.size) return true; if (seen.has(x)) return false; seen.add(x); return (reqs.get(x) ?? []).some(walk); };
  return (reqs.get(id) ?? []).some(walk);
}

// ---- media: what an operator may upload for a transmission
const MEDIA_TYPES: Record<string, string> = {
  "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/vnd.wave": ".wav", "audio/flac": ".flac", "audio/x-flac": ".flac",
  "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/ogg": ".ogg", "application/ogg": ".ogg",
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
};
export const MEDIA_MAX_BYTES = 60 * 1024 * 1024;
/** The extension to store under, or null if this isn't an allowed audio / image type. The type must agree with the file name's extension. */
export function mediaExt(filename: string, mime: string): string | null {
  const ext = MEDIA_TYPES[mime.toLowerCase()];
  if (!ext) return null;
  const given = (/\.[a-z0-9]+$/i.exec(filename)?.[0] ?? "").toLowerCase().replace(".jpeg", ".jpg");
  return given === ext ? ext : null;
}
