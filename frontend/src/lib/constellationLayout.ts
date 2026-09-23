export interface ConstellationTrack {
  id: number;
  genres: string[]; // first entry is the root/home genre
}

export interface ConstellationRegion {
  name: string;
  x: number;
  y: number;
  trackCount: number;
}

export interface Star {
  trackId: number;
  x: number;
  y: number;
  rootGenre: string;
  genres: string[];
}

/** A line segment for one of a star's non-root genre connections, plus
 *  the shape lines connecting stars within the same constellation (both
 *  rendered the same way - as lines - so "how many genres does this
 *  track have" is never a geometric constraint, just how many lines
 *  fan out from it). */
export interface ConnectionLine {
  trackId: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  kind: "shape" | "cross-genre";
  toGenre: string;
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Positions one region per root genre via force-directed layout - and
 *  since regions never need to overlap here (a track's genre membership
 *  is shown with lines now, not shape intersection), this is a much
 *  simpler simulation than the old blob layout: regions with shared
 *  cross-genre tracks pull gently together, everything else just
 *  repels to stay legible. */
export function layoutConstellationRegions(tracks: ConstellationTrack[]): ConstellationRegion[] {
  const rootCounts = new Map<string, number>();
  for (const t of tracks) {
    if (t.genres.length === 0) continue;
    const root = t.genres[0];
    rootCounts.set(root, (rootCounts.get(root) ?? 0) + 1);
  }
  const roots = [...rootCounts.keys()];
  if (roots.length === 0) return [];

  const crossWeight = new Map<string, number>();
  for (const t of tracks) {
    if (t.genres.length < 2) continue;
    const root = t.genres[0];
    for (const g of t.genres.slice(1)) {
      if (!rootCounts.has(g)) continue; // only connect to genres that are actually someone's root
      const key = [root, g].sort().join("\u0000");
      crossWeight.set(key, (crossWeight.get(key) ?? 0) + 1);
    }
  }

  const regions = roots.map((name) => {
    const seed = hashOf(name);
    const rand = seededRand(seed);
    const angle = rand() * Math.PI * 2;
    const dist = 220 + rand() * 140;
    return { name, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, vx: 0, vy: 0 };
  });

  for (let step = 0; step < 300; step++) {
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i];
        const b = regions[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const key = [a.name, b.name].sort().join("\u0000");
        const weight = crossWeight.get(key) ?? 0;
        // Regions always want real separation (they're constellations,
        // not overlapping shapes) - shared tracks just pull the target
        // distance in some, not collapse it to zero.
        const targetDist = Math.max(160, 320 - weight * 28);
        const diff = dist - targetDist;
        const force = diff * 0.015;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const r of regions) {
      r.vx += -r.x * 0.001;
      r.vy += -r.y * 0.001;
      r.vx *= 0.85;
      r.vy *= 0.85;
      r.x += r.vx;
      r.y += r.vy;
    }
  }

  return regions.map((r) => ({ name: r.name, x: r.x, y: r.y, trackCount: rootCounts.get(r.name)! }));
}

/** Scatters each constellation's tracks as stars within its region -
 *  deterministic per track so positions are stable across reloads. */
export function layoutStars(tracks: ConstellationTrack[], regions: ConstellationRegion[]): Star[] {
  const regionByName = new Map(regions.map((r) => [r.name, r]));
  return tracks
    .filter((t) => t.genres.length > 0 && regionByName.has(t.genres[0]))
    .map((t) => {
      const region = regionByName.get(t.genres[0])!;
      const rand = seededRand(hashOf(`star:${t.id}`));
      // Spread scales gently with how many stars share this
      // constellation, so a big genre's stars don't all pile up.
      const spread = 40 + Math.sqrt(region.trackCount) * 20;
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * spread; // sqrt for uniform area density, not center-biased
      return { trackId: t.id, x: region.x + Math.cos(angle) * r, y: region.y + Math.sin(angle) * r, rootGenre: t.genres[0], genres: t.genres };
    });
}

/** All connection lines for every star: the faint always-visible
 *  "constellation shape" lines to its nearest same-root neighbors, plus
 *  one line per non-root genre reaching out to that genre's region -
 *  the actual mechanism that makes overlap unlimited, since a star with
 *  six genres just gets six lines, never a geometric conflict. */
export function buildConnectionLines(stars: Star[], regions: ConstellationRegion[]): ConnectionLine[] {
  const regionByName = new Map(regions.map((r) => [r.name, r]));
  const byRoot = new Map<string, Star[]>();
  for (const s of stars) {
    if (!byRoot.has(s.rootGenre)) byRoot.set(s.rootGenre, []);
    byRoot.get(s.rootGenre)!.push(s);
  }

  const lines: ConnectionLine[] = [];

  // Shape lines: connect each star to its nearest same-constellation
  // neighbor(s) - a lightweight nearest-neighbor chain, not a full
  // minimum spanning tree, since this is decorative flavor rather than
  // information-bearing.
  for (const group of byRoot.values()) {
    for (const s of group) {
      const others = group.filter((o) => o.trackId !== s.trackId);
      if (others.length === 0) continue;
      others.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
      const nearest = others[0];
      lines.push({ trackId: s.trackId, fromX: s.x, fromY: s.y, toX: nearest.x, toY: nearest.y, kind: "shape", toGenre: s.rootGenre });
    }
  }

  // Cross-genre lines: one per non-root genre, reaching to that genre's
  // region center.
  for (const s of stars) {
    for (const g of s.genres.slice(1)) {
      const region = regionByName.get(g);
      if (!region) continue;
      lines.push({ trackId: s.trackId, fromX: s.x, fromY: s.y, toX: region.x, toY: region.y, kind: "cross-genre", toGenre: g });
    }
  }

  return lines;
}
