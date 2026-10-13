// The Field Log catalogue: everything on the site that can be probed, grouped into sections. Pure shaping; the route does the queries.
export interface LogEntry { key: string; title: string; href: string; stages?: { key: string; label: string }[] }
export interface LogSection { id: "lore" | "creatures" | "recordings"; title: string; entries: LogEntry[] }

const CAP = 400;
export interface CatalogInput {
  wiki: { slug: string; title: string }[];
  studies: { slug: string; title: string }[];
  branches: { slug: string; name: string }[];
  phenomena: { slug: string; title: string; body: string; chain: string | null; hasExample: boolean }[];
  albums: { slug: string; title: string }[];
}

/** A phenomenon card reveals in up to four steps; a step exists only if the card has that part, so a card is never stuck below 100%. */
export function phenomenonStages(p: { slug: string; body: string; chain: string | null; hasExample: boolean }): { key: string; label: string }[] {
  const s = [{ key: `phenom:${p.slug}`, label: "Name" }];
  if (p.body.trim()) s.push({ key: `phenom:${p.slug}#body`, label: "Notes" });
  if (p.hasExample) s.push({ key: `phenom:${p.slug}#ex`, label: "Example" });
  if (p.chain) s.push({ key: `phenom:${p.slug}#chain`, label: "Preset" });
  return s;
}

export function buildCatalog(i: CatalogInput): LogSection[] {
  const lore: LogEntry[] = [
    ...i.wiki.map((w) => ({ key: `wiki:${w.slug}`, title: w.title, href: `/wiki/${w.slug}` })),
    ...i.studies.map((s) => ({ key: `study:${s.slug}`, title: s.title, href: `/study/${s.slug}` })),
    ...i.branches.map((b) => ({ key: `branch:${b.slug}`, title: b.name, href: `/branch/${b.slug}` })),
  ].slice(0, CAP);
  const creatures: LogEntry[] = i.phenomena.slice(0, CAP).map((p) => ({ key: `phenom:${p.slug}`, title: p.title, href: `/xenolab?tab=phenomena&item=${encodeURIComponent(p.slug)}`, stages: phenomenonStages(p) }));
  const recordings: LogEntry[] = i.albums.slice(0, CAP).map((a) => ({ key: `album:${a.slug}`, title: a.title, href: `/album/${a.slug}` }));
  return [
    { id: "lore", title: "Lore", entries: lore },
    { id: "creatures", title: "Phenomena", entries: creatures },
    { id: "recordings", title: "Recordings", entries: recordings },
  ];
}
