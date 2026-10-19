// What the public Chart may know about the branches. Hidden branches are drawn as sealed rooms: their place in the tree is shown, their name and address are not.
export interface ChartRow { id: number; slug: string; name: string; parentId: number | null; visibility: "VISIBLE" | "HIDDEN" | "BABY_CRYSTALS"; chartHidden: boolean; sealedGate: string | null }
export type ChartNode = { id: number; parentId: number | null; slug: string; name: string } | { id: number; parentId: number | null; secret: true; key: string; gate: string | null };

/** The same 32-bit FNV-1a as the site's scan keys (frontend lib/probeCore hashStr), so the browser can recognise a sealed room it has already walked into without being told its address. */
export function slugKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
export function buildChartNodes(rows: ChartRow[]): ChartNode[] {
  const out: ChartNode[] = [];
  for (const r of rows) {
    if (r.chartHidden) continue;
    if (r.visibility === "HIDDEN") out.push({ id: r.id, parentId: r.parentId, secret: true, key: slugKey(r.slug), gate: r.sealedGate ?? null });
    else out.push({ id: r.id, parentId: r.parentId, slug: r.slug, name: r.name });
  }
  return out;
}
