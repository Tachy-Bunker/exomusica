// Twelve Artifacts (milestone m-artifacts). Pure rules, no database, so they are tested without one.
import { PROBE_KEY, PROBE_KINDS } from "./probe.js";

export const ARTIFACT_COUNT = 12;
const MAX_TITLE = 80;
const MAX_TEXT = 1200;

/** The community scan count at which each slot (1..12) reveals: k/12 of the milestone's target, rounded up. */
export function artifactThresholds(target: number): number[] {
  return Array.from({ length: ARTIFACT_COUNT }, (_, i) => Math.ceil(((i + 1) * target) / ARTIFACT_COUNT));
}

// A motif is four notes from a major pentatonic, over a root between 220 and 440 Hz. It depends only on the seed, so every device hears the same one.
const PENTA = [0, 2, 4, 7, 9];
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** Four frequencies in Hz (each between 220 and about 1200), derived from a seed such as the item's key. */
export function motifFromSeed(seed: string): number[] {
  let x = hash32(seed) || 1;
  const next = (): number => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
  const root = 220 * Math.pow(2, (next() % 12) / 12);
  return Array.from({ length: 4 }, () => {
    const d = next() % 10;
    const semis = PENTA[d % 5] + 12 * Math.floor(d / 5);
    return Math.round(root * Math.pow(2, semis / 12) * 100) / 100;
  });
}

/** A motif's notes as the admin enters them: exactly four frequencies between 20 and 5000 Hz. */
export function cleanNotes(v: unknown): number[] | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 4) return undefined;
  if (!v.every((f) => typeof f === "number" && Number.isFinite(f) && f > 20 && f < 5000)) return undefined;
  return v.map((f) => Math.round(f * 100) / 100);
}

export interface ArtifactBody { kind: string | null; key: string | null; title: string | null; text: string | null; notes: number[] | null }

/** The admin's whole form for one slot. Every field is replaced on save; null (or an empty string) clears it. kind and key go together. */
export function cleanArtifactBody(b: Record<string, unknown>): { ok: true; value: ArtifactBody } | { ok: false; error: string } {
  const text = (v: unknown, max: number): string | null | undefined => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t === "" ? null : t.length > max ? undefined : t;
  };
  const kind = b.kind === "" ? null : b.kind ?? null;
  const key = b.key === "" ? null : b.key ?? null;
  if (kind !== null && !(typeof kind === "string" && (PROBE_KINDS as readonly string[]).includes(kind))) return { ok: false, error: "kind must be lore, track, person or point" };
  if (key !== null && !(typeof key === "string" && PROBE_KEY.test(key))) return { ok: false, error: "key must look like album:slug, study:slug, wiki:slug or user:name" };
  if ((kind === null) !== (key === null)) return { ok: false, error: "kind and key go together: set both, or neither" };
  const title = text(b.title, MAX_TITLE);
  if (title === undefined) return { ok: false, error: `title must be at most ${MAX_TITLE} characters` };
  const body = text(b.text, MAX_TEXT);
  if (body === undefined) return { ok: false, error: `text must be at most ${MAX_TEXT} characters` };
  const notes = cleanNotes(b.notes ?? null);
  if (notes === undefined) return { ok: false, error: "notes must be four frequencies in Hz, each between 20 and 5000" };
  return { ok: true, value: { kind: kind as string | null, key: key as string | null, title, text: body, notes } };
}

/** Temporary texts, shown until the owner writes a slot's own. Shown with a "temporary" flag in the admin. */
export const TEMP_ARTIFACTS: readonly { title: string; text: string }[] = [
  { title: "Artifact I", text: "Temporary text. The first thing the community recovered, before anyone knew what it was for." },
  { title: "Artifact II", text: "Temporary text. A second object, found where the scans kept returning." },
  { title: "Artifact III", text: "Temporary text. Warm to the touch, though nothing in the room is heated." },
  { title: "Artifact IV", text: "Temporary text. It hums only while someone is looking at it." },
  { title: "Artifact V", text: "Temporary text. Its label has been scanned so often that the paint has worn off." },
  { title: "Artifact VI", text: "Temporary text. The halfway point. Nobody has agreed on which way it faces." },
  { title: "Artifact VII", text: "Temporary text. Quiet, until the seventh scan of its neighbour." },
  { title: "Artifact VIII", text: "Temporary text. A key that opens nothing yet." },
  { title: "Artifact IX", text: "Temporary text. It repeats the last sound the community made, a little slower." },
  { title: "Artifact X", text: "Temporary text. Ten thousand looks, and it still has not told us its name." },
  { title: "Artifact XI", text: "Temporary text. Almost complete. The eleventh object sits closest to the core." },
  { title: "Artifact XII", text: "Temporary text. The last one. It was here before the map." },
];
