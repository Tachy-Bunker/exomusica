// Layout and shuffling for the compact branch map on the homepage. Pure, so it is tested without a browser.

export interface ExploreBranch {
  slug: string;
  posX: number;
  posY: number;
  parentSlug: string | null;
  albums: number;
}
export interface ExploreNode { slug: string; x: number; y: number; r: number }
export interface ExploreEdge { from: string; to: string }

export const VIEW_W = 100;
export const VIEW_H = 62;
const PAD = 9;

/** Fits every branch inside the view, keeping the map's proportions. A single branch, or branches all at one point, sit in the middle. */
export function layoutBranches(branches: ExploreBranch[]): { nodes: ExploreNode[]; edges: ExploreEdge[] } {
  if (branches.length === 0) return { nodes: [], edges: [] };
  const xs = branches.map((b) => b.posX), ys = branches.map((b) => b.posY);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;
  const innerW = VIEW_W - 2 * PAD, innerH = VIEW_H - 2 * PAD;
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX === 0 ? Infinity : innerW / spanX, spanY === 0 ? Infinity : innerH / spanY);
  const offX = (VIEW_W - spanX * scale) / 2, offY = (VIEW_H - spanY * scale) / 2;
  const maxAlbums = Math.max(1, ...branches.map((b) => b.albums));
  const nodes = branches.map((b) => ({
    slug: b.slug,
    x: round(offX + (b.posX - minX) * scale),
    y: round(offY + (b.posY - minY) * scale),
    r: round(1.6 + 2.4 * Math.sqrt(b.albums / maxAlbums)), // bigger for branches with more albums, but never huge or invisible
  }));
  const known = new Set(branches.map((b) => b.slug));
  const edges = branches.filter((b) => b.parentSlug && known.has(b.parentSlug)).map((b) => ({ from: b.parentSlug!, to: b.slug }));
  return { nodes, edges };
}
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * "Shuffle" that feels fair: it goes through every branch once, in random order, before any repeats,
 * and never shows the same branch twice in a row, even across the start of a new round.
 */
export function makeShuffler(slugs: string[], rng: () => number = Math.random): (current?: string | null) => string | null {
  let bag: string[] = [];
  return (current) => {
    if (slugs.length === 0) return null;
    if (slugs.length === 1) return slugs[0];
    if (bag.length === 0) {
      bag = [...slugs];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag[bag.length - 1] === current) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    let next = bag.pop()!;
    if (next === current && bag.length) { const other = bag.pop()!; bag.push(next); next = other; }
    return next;
  };
}
