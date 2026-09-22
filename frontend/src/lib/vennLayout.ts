export interface VennTrack {
  id: number;
  genres: string[];
}

export interface GenreBlob {
  name: string;
  x: number;
  y: number;
  radius: number;
  // A stable, organic (non-circle) outline: radius offsets at N angles
  // around the blob, seeded per-genre so it's consistent across reloads
  // but visually irregular rather than a perfect circle.
  shapeOffsets: number[];
}

export interface TrackPoint {
  trackId: number;
  x: number;
  y: number;
  genres: string[];
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

const SHAPE_POINTS = 14; // vertices per blob outline

/** Lays out one blob per genre via a simple force simulation: blobs that
 *  share at least one track attract each other (more shared tracks =
 *  stronger pull), all blobs mutually repel to avoid unwanted overlap of
 *  unrelated genres. Deterministic per input (seeded), so the same
 *  playlist produces the same layout across reloads. */
export function layoutGenreBlobs(tracks: VennTrack[]): GenreBlob[] {
  const genreCounts = new Map<string, number>();
  for (const t of tracks) for (const g of t.genres) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
  const genres = [...genreCounts.keys()];
  if (genres.length === 0) return [];

  // Shared-track weight between every pair of genres.
  const sharedWeight = new Map<string, number>();
  for (const t of tracks) {
    for (let i = 0; i < t.genres.length; i++) {
      for (let j = i + 1; j < t.genres.length; j++) {
        const key = [t.genres[i], t.genres[j]].sort().join("\u0000");
        sharedWeight.set(key, (sharedWeight.get(key) ?? 0) + 1);
      }
    }
  }

  const blobs = genres.map((name) => {
    const seed = hashOf(name);
    const rand = seededRand(seed);
    const angle = rand() * Math.PI * 2;
    const dist = 80 + rand() * 60;
    return {
      name,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      radius: 40 + Math.sqrt(genreCounts.get(name)!) * 22,
      vx: 0,
      vy: 0,
    };
  });

  // A short, fixed number of simulation steps rather than running to
  // convergence - this is a decorative layout, not a physics sim that
  // needs precision, and a fixed step count keeps this fast and
  // deterministic.
  for (let step = 0; step < 220; step++) {
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i];
        const b = blobs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const key = [a.name, b.name].sort().join("\u0000");
        const shared = sharedWeight.get(key) ?? 0;
        const targetGap = a.radius + b.radius - Math.min(a.radius, b.radius) * Math.min(0.8, shared * 0.25);
        const diff = dist - targetGap;
        // Spring toward the target gap - pulls closer when sharing
        // tracks (targetGap shrinks with more shared tracks, allowing
        // real overlap), pushes apart otherwise.
        const force = diff * 0.02;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const b of blobs) {
      // Mild pull toward center so the whole layout doesn't drift away.
      b.vx += -b.x * 0.0015;
      b.vy += -b.y * 0.0015;
      b.vx *= 0.85;
      b.vy *= 0.85;
      b.x += b.vx;
      b.y += b.vy;
    }
  }

  return blobs.map((b) => {
    const rand = seededRand(hashOf(b.name) + 1);
    const shapeOffsets = Array.from({ length: SHAPE_POINTS }, () => 0.78 + rand() * 0.44);
    return { name: b.name, x: b.x, y: b.y, radius: b.radius, shapeOffsets };
  });
}

/** Builds an SVG path for a genre blob's organic outline from its
 *  per-angle radius offsets, using a closed cardinal spline so the shape
 *  is smoothly curved rather than a jagged polygon. */
/** A CSS border-radius value (8 percentages, standard "organic blob"
 *  syntax) derived from the same shapeOffsets, for rendering a blob as a
 *  plain styled <div> positioned exactly like every other element in
 *  this page's camera system (calc(50% + camera.x + x)px) - avoids any
 *  SVG-viewport coordinate mismatch entirely. */
export function blobBorderRadius(blob: GenreBlob): string {
  const o = blob.shapeOffsets;
  const pct = (i: number) => `${Math.round(35 + o[i % o.length] * 40)}%`;
  return `${pct(0)} ${pct(1)} ${pct(2)} ${pct(3)} / ${pct(4)} ${pct(5)} ${pct(6)} ${pct(7)}`;
}

export function blobPath(blob: GenreBlob): string {
  const pts = blob.shapeOffsets.map((offset, i) => {
    const angle = (i / SHAPE_POINTS) * Math.PI * 2;
    const r = blob.radius * offset;
    return [blob.x + Math.cos(angle) * r, blob.y + Math.sin(angle) * r];
  });
  if (pts.length < 3) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]} `;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]} `;
  }
  return d + "Z";
}

/** Track positions: the average of its genre blobs' centers (so a track
 *  spanning two genres sits in their overlap), with a small deterministic
 *  jitter so multiple tracks sharing the exact same genre combination
 *  don't render exactly on top of each other. Genreless tracks are
 *  placed in a fixed "unsorted" ring around the whole layout. */
export function layoutTracks(tracks: VennTrack[], blobs: GenreBlob[]): TrackPoint[] {
  const blobByName = new Map(blobs.map((b) => [b.name, b]));
  const bounds = blobs.reduce((m, b) => Math.max(m, Math.hypot(b.x, b.y) + b.radius), 200);

  return tracks.map((t) => {
    const rand = seededRand(hashOf(`track:${t.id}`));
    const matched = t.genres.map((g) => blobByName.get(g)).filter((b): b is GenreBlob => !!b);
    if (matched.length === 0) {
      const angle = rand() * Math.PI * 2;
      const r = bounds + 60 + rand() * 40;
      return { trackId: t.id, x: Math.cos(angle) * r, y: Math.sin(angle) * r, genres: t.genres };
    }
    const cx = matched.reduce((s, b) => s + b.x, 0) / matched.length;
    const cy = matched.reduce((s, b) => s + b.y, 0) / matched.length;
    const jitterR = Math.min(...matched.map((b) => b.radius)) * 0.5;
    const jAngle = rand() * Math.PI * 2;
    const jDist = rand() * jitterR;
    return { trackId: t.id, x: cx + Math.cos(jAngle) * jDist, y: cy + Math.sin(jAngle) * jDist, genres: t.genres };
  });
}

/** Orders every track point into a spiral traversal around an origin
 *  point (Archimedean-spiral-style: primarily by angle from the origin,
 *  with radius as a secondary tiebreaker within the same angular band) -
 *  used for "go to the neighboring track" autoplay, expanding outward
 *  around wherever playback started rather than jumping around at
 *  random. */
export function spiralOrder(points: TrackPoint[], originId: number): TrackPoint[] {
  const origin = points.find((p) => p.trackId === originId);
  if (!origin) return points;
  const withPolar = points
    .filter((p) => p.trackId !== originId)
    .map((p) => {
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      return { point: p, angle: Math.atan2(dy, dx), radius: Math.hypot(dx, dy) };
    });
  // Spiral score: angle sweeps around fastest, radius nudges the order
  // outward within each sweep - a small radius coefficient keeps this
  // from just becoming a plain radius sort.
  withPolar.sort((a, b) => a.angle + a.radius * 0.01 - (b.angle + b.radius * 0.01));
  return withPolar.map((w) => w.point);
}
