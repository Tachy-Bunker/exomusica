/** The chat dock's dial as it is stored for a member: pinned rooms, scenes, which are asleep. Never trusts what the client sends. */
export interface DialRoom { slug: string; name: string; branchSlug?: string; asleep?: boolean }
export interface DialScene { name: string; slots: (DialRoom | null)[] }
export interface Dial { presets: (DialRoom | null)[]; scenes: DialScene[] }

export const SLOTS = 6, MAX_SCENES = 5;
const slugOk = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(s);
const text = (s: unknown, max: number): string => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");

export function cleanRoom(r: unknown): DialRoom | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (!slugOk(o.slug)) return null;
  const out: DialRoom = { slug: o.slug, name: text(o.name, 80) || o.slug };
  if (slugOk(o.branchSlug)) out.branchSlug = o.branchSlug;
  if (o.asleep === true) out.asleep = true;
  return out;
}
const cleanSlots = (a: unknown): (DialRoom | null)[] => {
  const src = Array.isArray(a) ? a : [];
  const seen = new Set<string>();
  return Array.from({ length: SLOTS }, (_, i) => {
    const r = cleanRoom(src[i]); if (!r || seen.has(r.slug)) return null; seen.add(r.slug); return r;
  });
};
export function cleanDial(raw: unknown): Dial {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scenes: DialScene[] = [];
  for (const s of Array.isArray(o.scenes) ? o.scenes : []) {
    if (scenes.length >= MAX_SCENES || !s || typeof s !== "object") continue;
    const name = text((s as Record<string, unknown>).name, 24);
    if (!name || scenes.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    scenes.push({ name, slots: cleanSlots((s as Record<string, unknown>).slots) });
  }
  return { presets: cleanSlots(o.presets), scenes };
}
export const isEmptyDial = (d: Dial): boolean => d.scenes.length === 0 && d.presets.every((p) => !p);
