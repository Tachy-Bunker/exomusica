import { prisma } from "./prisma.js";
import type { SiteStats } from "./newsTokens.js";

const NOT_HIDDEN = { visibility: { not: "HIDDEN" as const } };
const TTL = 60_000;
let cached: { at: number; p: Promise<SiteStats> } | null = null;

async function compute(): Promise<SiteStats> {
  const [tracks, cTracks, albums, cAlbums, branches, members, posts, scans, studies, wiki, playlists, secs, first, perBranch] = await Promise.all([
    prisma.track.count({ where: { album: { branch: NOT_HIDDEN } } }),
    prisma.communityTrack.count(),
    prisma.album.count({ where: { branch: NOT_HIDDEN } }),
    prisma.communityAlbum.count(),
    prisma.branch.count({ where: NOT_HIDDEN }),
    prisma.user.count({ where: { isGhost: false, deletedAt: null } }),
    prisma.message.count({ where: { isDeleted: false } }),
    prisma.probeScan.count(),
    prisma.study.count(),
    prisma.wikiPage.count(),
    prisma.playlist.count(),
    prisma.track.aggregate({ _sum: { durationSeconds: true }, where: { album: { branch: NOT_HIDDEN } } }),
    prisma.user.aggregate({ _min: { createdAt: true }, where: { isGhost: false } }),
    prisma.album.findMany({ where: { branch: NOT_HIDDEN }, select: { branch: { select: { slug: true } }, _count: { select: { tracks: true } } } }),
  ]);
  const byBranch: SiteStats["byBranch"] = {};
  for (const a of perBranch) {
    const b = (byBranch[a.branch.slug] ??= { BRANCHTRACKCOUNT: 0, ALBUMS: 0 });
    b.BRANCHTRACKCOUNT += a._count.tracks;
    b.ALBUMS += 1;
  }
  return {
    totals: {
      TRACKS: tracks + cTracks, BRANCHTRACKCOUNT: tracks, COMMUNITYTRACKS: cTracks, ALBUMS: albums, COMMUNITYALBUMS: cAlbums,
      BRANCHES: branches, MEMBERS: members, POSTS: posts, SCANS: scans, STUDIES: studies, WIKIPAGES: wiki, PLAYLISTS: playlists,
      DAYS: first._min.createdAt ? Math.floor((Date.now() - first._min.createdAt.getTime()) / 86_400_000) : 0,
      MINUTES: Math.round((secs._sum.durationSeconds ?? 0) / 60),
    },
    byBranch,
  };
}

/** One shared computation per minute, however many pages and readers ask. */
export function getSiteStats(): Promise<SiteStats> {
  if (!cached || Date.now() - cached.at > TTL) {
    const p = compute();
    cached = { at: Date.now(), p };
    p.catch(() => { if (cached?.p === p) cached = null; });
  }
  return cached.p;
}
