import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const PREVIEWS_DIR = path.join(UPLOADS_DIR, "playlist-previews");

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Regenerates a playlist's static preview image and updates its
// previewImageUrl - called after any track add/remove/reorder so the
// image never goes stale. Deliberately doesn't try to replicate the
// live spacemap's wander physics: a golden-angle spiral gives a stable,
// evenly-spread, good-looking layout with none of that complexity,
// which is all a static snapshot actually needs.
export async function regeneratePlaylistPreview(playlistId: number): Promise<void> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: {
      slug: true,
      items: {
        select: {
          track: { select: { albumId: true, album: { select: { title: true, coverArtUrl: true } } } },
          communityTrack: { select: { albumId: true, album: { select: { title: true, coverArtUrl: true } } } },
        },
      },
    },
  });
  if (!playlist) return;

  const albums = new Map<string, { title: string; coverArtUrl: string | null; trackCount: number }>();
  for (const item of playlist.items) {
    const info = item.track ? { key: `o:${item.track.albumId}`, ...item.track.album } : item.communityTrack ? { key: `c:${item.communityTrack.albumId}`, ...item.communityTrack.album } : null;
    if (!info) continue;
    const existing = albums.get(info.key);
    if (existing) existing.trackCount++;
    else albums.set(info.key, { title: info.title, coverArtUrl: info.coverArtUrl, trackCount: 1 });
  }

  const GOLDEN_ANGLE = 2.399963;
  const SPACING = 70;
  const entries = [...albums.entries()];
  const points = entries.map(([key], i) => {
    const r = SPACING * Math.sqrt(i + 1);
    const theta = i * GOLDEN_ANGLE;
    return { key, x: r * Math.cos(theta), y: r * Math.sin(theta) };
  });

  const maxR = points.length > 0 ? Math.max(...points.map((p) => Math.hypot(p.x, p.y))) : 0;
  const coverRadius = 26;
  const pad = coverRadius + 24;
  const half = maxR + pad;
  const size = Math.max(200, half * 2);

  const circles = points
    .map((p, i) => {
      const [, info] = entries[i];
      const r = coverRadius * (0.7 + Math.min(0.5, Math.sqrt(info.trackCount) * 0.12));
      const hue = hashOf(info.title) % 360;
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="hsl(${hue}, 45%, 45%)" stroke="hsl(${hue}, 60%, 65%)" stroke-width="1.5" opacity="0.92" />`;
    })
    .join("\n    ");

  const svg = `<svg viewBox="${-half} ${-half} ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="#151022" />
      <stop offset="100%" stop-color="#070510" />
    </radialGradient>
  </defs>
  <rect x="${-half}" y="${-half}" width="${size}" height="${size}" fill="url(#bg)" />
  ${circles}
  <circle cx="0" cy="0" r="14" fill="#8a6fd8" stroke="#c9b8ff" stroke-width="2" />
  <circle cx="0" cy="0" r="14" fill="none" stroke="#c9b8ff" stroke-width="1" opacity="0.5">
    <animate attributeName="r" values="14;20;14" dur="3s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
  </circle>
</svg>`;

  await mkdir(PREVIEWS_DIR, { recursive: true });
  const filePath = path.join(PREVIEWS_DIR, `${playlist.slug}.svg`);
  await writeFile(filePath, svg, "utf-8");

  const publicUrl = `/uploads/playlist-previews/${playlist.slug}.svg?v=${Date.now()}`; // cache-bust on every regeneration
  await prisma.playlist.update({ where: { id: playlistId }, data: { previewImageUrl: publicUrl } });
}
